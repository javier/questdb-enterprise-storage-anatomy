// The model behind Fig 10: incremental backups of the primary, their retention, and the WAL
// cleaner that trims the replication store to the oldest backup kept. Pure: every answer
// is a function of the time u (in partition widths, PARTITION BY DAY, as in Fig 2) and the
// list of backup times.
//
// From the code (questdb-ent rust/qdb-ent/src/backup and wal/uploader/cleaner.rs):
//   - BACKUP DATABASE, or backup.schedule.cron (none by default; the docs' example is daily
//     at 00:00 UTC, drawn here), takes a checkpoint and diffs it against the last manifest
//     in the backup store. The unit is the partition: one is uploaded again only when its
//     rows, format or cold flag changed. A manifest names every partition, and an unchanged
//     one points at the older backup whose prefix holds it. There is no full mode: the first
//     backup simply finds everything new.
//   - A cold partition (its data.parquet in the object store after DROP LOCAL) is backed up
//     as its _pm and index only; the data stays where cold storage keeps it.
//   - After each backup, retention keeps the newest backup.cleanup.keep.latest.n (5) and
//     sweeps every object no kept manifest references. An object from an old backup lives on
//     while any kept manifest still points at it.
//   - The WAL cleaner on the primary (every 10 minutes) deletes WAL segments and txn parts up
//     to the txns of the oldest of the newest N backups or checkpoints, N following
//     keep.latest.n. Replica progress is not consulted.
//   - Local WAL on the primary is purged within seconds once applied and uploaded.
//   - A restore takes a kept backup; point-in-time recovery then replays WAL from the
//     replication store, so any moment from the oldest kept backup to now can be reached.

import { SINGLE, eventsOf } from "./fig1/model.mjs";

export const GRAIN = "DAY";
export const KEEP_ORDER = [3, 5];
export const KEEP_DEFAULT = 5;
export const CLEANER = 10 / 1440; // the WAL cleaner runs every 10 minutes
// how long things take on screen, in u (2.5 s per day)
export const VIS = { shift: 0.16, up: 0.4, sweep: 0.3, prune: 0.3 };
const C = SINGLE;
const HISTORY = 45; // days of daily backups the model looks back over

// What the primary holds of partition p at time t: its rows so far and its form.
export function stateOf(p, t) {
  if (t <= p + 1e-9) return null;
  const e = eventsOf("DAY", p, C);
  const rows = Math.min(1, t - p);
  const form = t >= e.cold[0] ? "cold" : t >= e.conv[0] ? "parquet" : "native";
  return { rows, form, key: (rows < 1 ? rows.toFixed(4) : "full") + form };
}

// Every backup at or before u: the daily schedule plus any taken by hand, oldest first.
// failed: backup times that never completed, which no manifest or retention counts.
export function backupsTo(u, manual = [], failed = []) {
  const out = [];
  for (let b = Math.ceil(u - HISTORY); b <= Math.floor(u + 1e-9); b++) if (!failed.some((f) => Math.abs(f - b) < 1e-6)) out.push(b);
  for (const m of manual) if (m <= u && m > u - HISTORY && !out.some((b) => Math.abs(b - m) < 1e-6)) out.push(m);
  return out.sort((a, b) => a - b);
}

// The backup (an index into list) whose prefix holds partition p's bytes for the manifest
// of backup j: the last one at or before j in which p had changed. -1: p is not in it.
export function holderOf(p, j, list) {
  const s = stateOf(p, list[j]);
  if (!s) return -1;
  let h = j;
  while (h > 0) {
    const prev = stateOf(p, list[h - 1]);
    if (!prev || prev.key !== stateOf(p, list[h]).key) break;
    h--;
  }
  return h;
}

// The partitions backup j uploaded itself.
export const uploadsOf = (j, list, partitions) => partitions.filter((p) => holderOf(p, j, list) === j);

// Where things stand at u. keep: backup.cleanup.keep.latest.n.
//   latest: the newest backup's index; running: it is still uploading (0..1) or null
//   kept: indices of the kept backups, newest first, once the latest has finished
//   swept: the backup retention removes after the latest finished, and how far (0..1)
//   boundary: the backup time the WAL cleaner has trimmed the store to, and the prune in
//   flight { from, to, f }
export function frameOf(u, keep, manual = [], failed = []) {
  const list = backupsTo(u, manual, failed);
  const latest = list.length - 1;
  const t = list[latest];
  const running = u - t < VIS.up ? (u - t) / VIS.up : null;
  const done = running === null ? latest : latest - 1; // the newest finished backup
  const kept = [];
  for (let j = done; j >= 0 && kept.length < keep; j--) kept.push(j);
  const doneAt = list[done] + VIS.up;
  const sweepF = (u - doneAt) / VIS.sweep;
  const swept = done - keep >= 0 && sweepF < 1 ? { j: done - keep, f: Math.max(0, sweepF) } : null;
  // the cleaner's next tick after the backup finished moves the boundary
  const oldest = kept[kept.length - 1];
  const tick = doneAt + CLEANER;
  const pruneF = (u - tick) / VIS.prune;
  let boundary = list[oldest], prune = null;
  if (u < tick && oldest > 0) boundary = list[oldest - 1];
  else if (pruneF < 1 && oldest > 0) prune = { from: list[oldest - 1], to: list[oldest], f: Math.max(0, pruneF) };
  return { list, latest, running, done, kept, swept, boundary, prune, shift: running === null ? 1 : Math.min(1, (u - t) / VIS.shift) };
}

// What was uploaded and what referenced, for a backup (index j) over the given partitions.
export function backupStats(j, list, partitions) {
  let up = 0, ref = 0, prefixes = new Set();
  for (const p of partitions) {
    const h = holderOf(p, j, list);
    if (h < 0) continue;
    if (h === j) up++;
    else ref++;
    prefixes.add(h);
  }
  return { up, ref, prefixes: prefixes.size };
}
