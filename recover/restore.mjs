// The model behind Figs 7 and 8: building a new instance from Fig 7's backups and WAL.
// Pure: every answer is a function of the mode, the target and the seconds since the run
// began. The source cluster, a primary and a first replica, runs on untouched throughout.
//
// From the code and the docs (operations/backup.md, operations/point-in-time-recovery.md):
//   A NEW REPLICA FROM A BACKUP (Fig 8) is one boot: _backup_restore with
//     replication.role=replica and the cluster's replication.object.store. It restores a kept
//     backup, every partition its manifest names fetched from whichever backup prefix holds
//     it, up to 8 at a time (backup.max.concurrent.network.requests); a cold partition comes
//     back as _pm and index only, reading from the cluster's cold prefix as a refresher. It
//     then replays WAL from the store to the latest and keeps following the primary: same
//     DataID, same stores. A base older than the WAL kept in the store fails with ER003.
//   POINT-IN-TIME RECOVERY (Fig 9) takes two boots of a new instance with an empty db/:
//     boot 1  _backup_restore with no replication configured: the newest kept backup at or
//             before the target.
//     boot 2  _recover_point_in_time with the source's replication.object.store and
//             replication.recovery.timestamp: WAL replayed up to the last commit at or before
//             the target. The node takes a fresh DataID and is cut off from the source for
//             good. It runs standalone, or as the primary of a new cluster on a brand new,
//             empty object store (one holding replication data is refused). Cold partitions
//             read from a copy of the cold prefix, never the live one.

import { partitionsAt } from "../fig1-partitions/model.mjs";
import { GRAIN, frameOf, holderOf, stateOf } from "../fig7-backups/backup.mjs";

export const SOURCE_U = 60.9; // the source cluster, held at one moment, retention at rest
export const KEEP = 5;
export const STREAMS = 8;
export const MODES = {
  newest: { label: "FROM THE NEWEST BACKUP", pitr: false, base: "newest" },
  oldest: { label: "FROM THE OLDEST KEPT", pitr: false, base: "oldest" },
  cluster: { label: "PITR · NEW CLUSTER", pitr: true },
  standalone: { label: "PITR · STANDALONE", pitr: true },
};
export const FIGURES = { replica: ["newest", "oldest"], pitr: ["standalone", "cluster"] };
// seconds of each step, as drawn
export const T = { idle: 1, restore: 3.6, reboot: 0.9, replay: 3, cut: 1.2, after: 5 };
export const FLY = 0.55; // one partition's download, as drawn

export const source = () => frameOf(SOURCE_U, KEEP);

// The base: for a replica, the newest or the oldest kept backup; for a recovery, the newest
// kept backup at or before the target. An index into the backup list.
export function baseFor(mode, target) {
  const F = source();
  const m = MODES[mode];
  if (m.base === "newest") return F.kept[0];
  if (m.base === "oldest") return F.kept[F.kept.length - 1];
  let best = -1;
  for (const j of F.kept) if (F.list[j] <= target + 1e-9 && (best < 0 || F.list[j] > F.list[best])) best = j;
  return best;
}
// The range a target may take: from the oldest kept backup, where the WAL begins, to now.
export function targetRange() {
  const F = source();
  return { min: F.list[F.kept[F.kept.length - 1]], max: SOURCE_U };
}

// The steps of a run, as start times in seconds.
export function stepsOf(mode) {
  const pitr = MODES[mode].pitr;
  const restore = T.idle;
  const reboot = restore + T.restore;
  const replay = pitr ? reboot + T.reboot : reboot;
  const cut = replay + T.replay;
  const after = pitr ? cut + T.cut : cut;
  return { restore, reboot, replay, cut, after, end: after + T.after };
}

// Everything the drawing needs at second s of a run.
export function runOf(mode, target, s) {
  const F = source();
  const pitr = MODES[mode].pitr;
  const to = pitr ? target : SOURCE_U;
  const base = baseFor(mode, to);
  const st = stepsOf(mode);
  const ps = partitionsAt(GRAIN, SOURCE_U);
  // the partitions the base backup names, in the order they download: newest first, 8 at once
  const named = ps.filter((p) => holderOf(p, base, F.list) >= 0).reverse();
  const batch = (T.restore - FLY) / Math.max(1, Math.ceil(named.length / STREAMS) - 1);
  const downloads = named.map((p, i) => ({ p, holder: holderOf(p, base, F.list), t0: st.restore + Math.floor(i / STREAMS) * batch }));
  // how far the WAL replay has got, as a moment in the source's time
  const r = Math.max(0, Math.min(1, (s - st.replay) / T.replay));
  const replayed = F.list[base] + (to - F.list[base]) * (s >= st.replay ? easeIn(r) : 0);
  // what the new instance holds of each partition
  const held = [];
  for (const d of downloads) {
    if (s < d.t0 + FLY) continue;
    const b = stateOf(d.p, F.list[base]);
    const now = stateOf(d.p, replayed);
    held.push({ p: d.p, rows: now ? now.rows : b.rows, form: b.form });
  }
  // partitions the WAL creates after the base
  if (s >= st.replay) for (const p of ps) if (!named.includes(p) && replayed > p + 1e-6) held.push({ p, rows: Math.min(1, replayed - p), form: "native" });
  const phase = s < st.restore ? "idle" : s < st.reboot ? "restore" : s < st.replay ? "reboot" : s < st.cut ? "replay" : s < st.after ? "cut" : "after";
  return { F, base, to, st, downloads, replayed, held, phase, r, s, mode, pitr, cut: pitr && s >= st.cut ? Math.min(1, (s - st.cut) / T.cut) : 0 };
}

const easeIn = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
