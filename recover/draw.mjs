// The moving parts of Figs 7 and 8 at second s of a run. Pure: keyed items for the new
// instance's partitions, markup for the rest.
//
// The source is Fig 6 held at one moment: its primary and its first replica, the object store
// with the WAL tape, and the backup stand. Both keep running. The new instance stands on a
// third bench at the front. Its partitions keep the source's places along the age axis, so a
// recovered node's data visibly stops at the target. In Fig 8 a line on the floor marks the
// boundary of the source cluster, and the recovered node's own store stands beside it.

import { BENCH, FLOOR, HEAD, LANE_Y, RULER, X_NOW, axisOf } from "../fig1-partitions/parts.mjs";
import { nameOf } from "../fig1-partitions/model.mjs";
import { GRAIN, stateOf } from "../fig6-backups/backup.mjs";
import { BACK, STORE6, WAL_Y, rowAt } from "../fig6-backups/draw.mjs";
import { FLY, MODES, SOURCE_U, runOf } from "./restore.mjs";

// the new instance on a third bench at the front, and the ruler in front of it
export const NEW = 2;
export const NEW_Y = 156;
LANE_Y[NEW] = NEW_Y;
RULER.y = NEW_Y + BENCH.d / 2 + 4;
export const FENCE_Y = (LANE_Y[1] + NEW_Y) / 2;
// the recovered node's own store, beside its head
export const NEWSTORE = { x: 216, y: NEW_Y - 16, w: 60, d: 28, r: 2, z: 22, t: 3 };
const NEW_TOP = NEWSTORE.z + NEWSTORE.t;
const CHIP = 0.42; // the WAL cadence, in seconds, as in Fig 3
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function makeRestore(k, P, parts, backups) {
  const L = (d, style) => k.lineSvg(d, style);
  const D = (pts, style) => k.dotsSvg(pts, style);
  const at = (pt) => k.iso(pt, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const slab = (plan, z, h, style) => S(k.slabOf(plan, z, h, P, 2, Math.min(0.3, h / 3)), style);
  const { xOfAge } = axisOf(GRAIN);
  const u = SOURCE_U;
  const q = (x) => Math.round(x * 5) / 5;
  const spanOf = (p, rows = 1) => {
    const x0 = xOfAge(u - p), x1 = xOfAge(u - p - rows);
    const gap = Math.min(0.8, (x1 - x0) * 0.1);
    return { left: x0 + gap, len: x1 - x0 - 2 * gap };
  };
  const tapeZ = STORE6.z + STORE6.t + 1.2;
  const tapeEnd = [X_NOW - 2, WAL_Y, tapeZ];

  // the copy of the cold prefix on the new store: a few Parquet partitions on pads
  function coldCopySvg() {
    let out = "";
    for (let j = 0; j < 4; j++) out += `<g transform="${k.translateAlong(P, [NEWSTORE.x + 5 + j * 12.5, NEWSTORE.y + 9, 0])}">${parts.copySvg(10.5, NEW_TOP, false)}</g>`;
    return out;
  }
  // the boundary of the source cluster: a strip on the floor between its replica and the
  // recovered node, from the bench ends to past the new store
  function fenceSvg() {
    const plan = { x: BENCH.x - 6, y: FENCE_Y - 1, w: NEWSTORE.x + NEWSTORE.w + 12 - BENCH.x, d: 2, r: 0.6 };
    // a low rail on posts, so it reads as a boundary and not a seam
    let out = slab(plan, FLOOR, 0.6, { tone: "lo", crease: "none" });
    const n = 14;
    for (let j = 0; j <= n; j++) {
      const x = plan.x + 2 + ((plan.w - 4) * j) / n;
      out += S(k.cylinder(x, FENCE_Y, 0.8, FLOOR + 0.6, 14, P, 14), { tone: "mid" });
    }
    out += slab({ x: plan.x + 1, y: FENCE_Y - 0.6, w: plan.w - 2, d: 1.2, r: 0.4 }, FLOOR + 14.6, 1, { tone: "hi", crease: "lo" });
    return out;
  }

  function render(mode, target, s) {
    const R = runOf(mode, target, s);
    const { F, base, to, st } = R;
    const pitr = MODES[mode].pitr;

    // the source backup stand and tape, the base backup's manifest lit with the WAL it needs
    const lit = s >= st.restore ? { row: F.list[base], to } : null;
    const src = backups(u, 5, [], lit);

    // the new instance's partitions, at their places on the axis
    const blocks = [];
    for (const h of R.held) {
      const { left, len } = spanOf(h.p, h.rows);
      if (len < 0.4) continue;
      const m = h.form === "native" ? 0 : 1, evict = h.form === "cold" ? 1 : 0;
      blocks.push({ id: "n" + h.p, p: h.p, x: left, y: LANE_Y[NEW], z: 0, key: [q(len), m, evict].join(), html: () => parts.blockSvg(q(len), { m, sealed: evict, evict }) });
    }

    // downloads: each partition's tile from the step that holds it down to the new bench
    let flying = "";
    for (const d of R.downloads) {
      const f = (s - d.t0) / FLY;
      if (f < 0 || f >= 1) continue;
      const b = stateOf(d.p, F.list[base]);
      const { left, len } = spanOf(d.p, b.rows);
      if (len < 0.4) continue;
      const pos = F.kept.includes(d.holder) ? F.latest - d.holder : BACK;
      const r = rowAt(pos);
      const [, y, z] = parts.flight([left, r.y, r.z + 0.6], [left, LANE_Y[NEW], 1.2], smooth(f));
      flying += `<g transform="${k.translateAlong(P, [left, y, z])}">${backups.tileSvg(q(len), b.form, true)}</g>`;
    }
    // WAL: the source primary keeps uploading and its replica keeps following, whatever
    // happens at the front
    for (let n = Math.floor(s / CHIP); n > Math.floor(s / CHIP) - 4; n--) {
      const t0 = n * CHIP;
      const f = (s - t0) / 0.5;
      if (f >= 0 && f < 1) flying += parts.chipSvg(parts.flight(parts.PORT(0), tapeEnd, f), false);
      const g = (s - t0 - 0.6) / 0.5;
      if (g >= 0 && g < 1) flying += parts.chipSvg(parts.flight(tapeEnd, parts.PORT(1), g), false);
    }
    // the replay streams segments down to the new instance; a new replica keeps following
    const following = !pitr && s >= st.after;
    for (let n = Math.floor(s / 0.12); n > Math.floor(s / 0.12) - 6; n--) {
      const t0 = n * 0.12;
      const f = (s - t0) / 0.5;
      if (f < 0 || f >= 1) continue;
      if (t0 >= st.replay && t0 < st.cut) {
        const tau = F.list[base] + (to - F.list[base]) * ((t0 - st.replay) / (st.cut - st.replay));
        flying += parts.chipSvg(parts.flight([xOfAge(u - tau), WAL_Y, tapeZ], parts.PORT(NEW), f), true);
      } else if (following && Math.abs(t0 / CHIP - Math.round(t0 / CHIP)) < 0.15) {
        flying += parts.chipSvg(parts.flight(tapeEnd, parts.PORT(NEW), f), false);
      }
    }
    // the primary of a new cluster uploads its own WAL to its own store
    let newWal = "";
    if (mode === "cluster" && s >= st.after) {
      const grow = Math.min(1, (s - st.after) / 4);
      const w = Math.max(0.4, (NEWSTORE.w - 8) * grow);
      newWal += slab({ x: NEWSTORE.x + 4, y: NEWSTORE.y + NEWSTORE.d - 7, w, d: 4.4, r: 0.4 }, NEW_TOP, 1.2, { tone: "hi", crease: "lo" });
      for (let n = Math.floor(s / CHIP); n > Math.floor(s / CHIP) - 3; n--) {
        const f = (s - n * CHIP) / 0.5;
        if (n * CHIP >= st.after && f >= 0 && f < 1) flying += parts.chipSvg(parts.flight(parts.PORT(NEW), [NEWSTORE.x + 4 + w, NEWSTORE.y + NEWSTORE.d - 5, NEW_TOP + 1.2], f), false);
      }
    }

    // the target: a flag on the tape and a post on the new bench where its data must stop
    let marks = "";
    if (pitr) {
      const x = xOfAge(u - target);
      marks += slab({ x: x - 0.7, y: WAL_Y - 3.6, w: 1.4, d: 1.4, r: 0.3 }, tapeZ - 1.2, 7, { tone: "lit", crease: "lo", lit: true });
      const front = LANE_Y[NEW] + 16;
      marks += L(k.segment([x, front - 1, 0], [x, front - 1, 14], P), { tone: "lit" }) + D([at([x, front - 1, 0]), at([x, front - 1, 14])], { size: 0.7, tone: "hi" });
    }

    // the words
    const day = (t) => nameOf(GRAIN, t + 1e-6).slice(5) + " " + String(Math.floor((((t % 1) + 1) % 1) * 24)).padStart(2, "0") + ":00";
    const W = [];
    const beside = (i, a, b) => {
      const pt = [HEAD.x + HEAD.w, LANE_Y[i] - HEAD.d / 2, HEAD.h];
      W.push(parts.label(pt, a, { anchor: "start", dx: 8, dy: -6 }));
      W.push(parts.label(pt, b, { anchor: "start", dx: 8, dy: 4, sub: true }));
    };
    beside(0, "PRIMARY", "keeps writing, as if nothing happened");
    beside(1, "REPLICA 1", "keeps following the primary");
    const lab = [HEAD.x + HEAD.w, LANE_Y[NEW] + HEAD.d / 2, 4];
    const say = (a, b) => { W.push(parts.label(lab, a, { anchor: "start", dx: -6, dy: 12 })); W.push(parts.label(lab, b, { anchor: "start", dx: -6, dy: 22, sub: true })); };
    const baseDay = day(F.list[base]);
    const name = pitr ? "NEW INSTANCE" : "REPLICA 2";
    if (R.phase === "idle") say(`${name} · empty db/`, pitr ? "no replication configured" : "replication.role=replica, the cluster's store");
    else if (R.phase === "restore") say(`${pitr ? "BOOT 1 · " : ""}_backup_restore`, `backup of ${baseDay} · ${R.held.length} of ${R.downloads.length} partitions, 8 at a time`);
    else if (R.phase === "reboot") say("RESTART", "_recover_point_in_time · target · source store");
    else if (R.phase === "replay") say(pitr ? "BOOT 2 · _recover_point_in_time" : `${name} · CATCHING UP`, pitr ? `replaying WAL ${baseDay} to ${day(to)}` : `replaying WAL from ${baseDay} to now`);
    else if (R.phase === "cut") say("RECOVERED · fresh DataID", "nothing more from the source");
    else if (mode === "standalone") say("STANDALONE", `recovered to ${day(to)} · no replication`);
    else if (mode === "cluster") say("NEW PRIMARY", "of a new cluster, fresh DataID");
    else say(name, "same DataID, follows the primary");
    if (pitr) {
      W.push(parts.label([xOfAge(u - target), LANE_Y[NEW] + 16, 14], `TARGET ${day(target)}`, { dy: -6 }));
      W.push(parts.label([BENCH.x - 4, FENCE_Y, FLOOR], "SOURCE CLUSTER · untouched", { anchor: "start", dy: -6 }));
      W.push(parts.label([BENCH.x - 4, FENCE_Y, FLOOR], mode === "cluster" ? "NEW CLUSTER" : "STANDALONE", { anchor: "start", dy: 12 }));
    }
    const shown = pitr ? smooth((s - st.reboot) / 0.6) : 0;
    if (shown > 0.5) {
      const ns = [NEWSTORE.x + NEWSTORE.w, NEWSTORE.y, NEWSTORE.z + NEWSTORE.t + 8];
      const own = mode === "cluster" && s >= st.after;
      W.push(parts.label(ns, mode === "cluster" ? "ITS OWN OBJECT STORE" : "COLD PREFIX COPY", { anchor: "start", dx: 6, dy: 4 }));
      W.push(parts.label(ns, mode === "cluster" ? (own ? "new, empty WAL · cold prefix copy" : "cold prefix copy · WAL to come") : "for cold partitions only", { anchor: "start", dx: 6, dy: 14, sub: true }));
    }

    return { R, src, blocks, flying, marks, newWal, labels: W.join(""), newStore: shown, fence: pitr ? 1 : 0 };
  }
  return Object.assign(render, { coldCopySvg, fenceSvg });
}

// One line for the readout.
export function storyOf7(mode, target, s, clock) {
  const R = runOf(mode, target, s);
  const { F, base, to } = R;
  const pitr = MODES[mode].pitr;
  const prefixes = new Set(R.downloads.map((d) => d.holder)).size;
  switch (R.phase) {
    case "idle": return pitr ? `Recover to ${clock(target)} · start from the newest kept backup before it, ${clock(F.list[base])}` : `A second replica, built from the backup of ${clock(F.list[base])} instead of from an empty store`;
    case "restore": return `_backup_restore · its manifest names ${R.downloads.length} partitions, fetched from ${prefixes} backup prefix${prefixes === 1 ? "" : "es"}; cold ones come back as _pm and index only`;
    case "reboot": return "Restart with _recover_point_in_time: the source's replication.object.store and replication.recovery.timestamp";
    case "replay": return pitr ? `Replaying WAL from the source store · up to the last commit at or before ${clock(to)}` : "role=replica: replaying WAL from the store to the latest; the older the backup, the more to replay";
    case "cut": return "Recovered · a fresh DataID, so it can never write into the source store; the source cluster carries on";
    default:
      if (mode === "standalone") return `Standalone at ${clock(to)} · nothing replicates · cold partitions read from a copy of the cold prefix, never the live one`;
      if (mode === "cluster") return "The primary of a new cluster, on its own empty object store · one that already holds replication data is refused";
      return "Replica 2 of the same cluster · same DataID, same stores · a base older than the WAL kept in the store fails with ER003";
  }
}
