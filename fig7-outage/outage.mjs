// The model behind Fig 7: the object store becomes unreachable for three days, then
// recovers. Pure: everything is a function of u (days, PARTITION BY DAY, as in Fig 1).
//
// From the Enterprise code (checked 2026-10-22; nothing treats an outage as a state of its
// own, each part retries on its own, and nothing local depends on the store):
//   - The primary keeps ingesting and applying WAL. Its uploader retries every 200 ms,
//     forever; each segment keeps an upload.pending marker, so local WAL purge keeps it.
//     Nothing caps that growth: it lasts until the store is back, or the disk is full.
//   - The replica polls every second, fails, keeps serving the data it has, and falls behind.
//   - A durable-ACK client gets no durable acks: no error either, its store-and-forward
//     buffer just grows. When the buffer is full (sf_max_total_bytes, 10 GiB on disk by
//     default) an append blocks 30 s, then throws. Plain-ACK clients are not affected.
//   - TO REMOTE cannot upload: the partition stays local, retried on every policy sweep.
//   - DROP LOCAL still seals the partition, a WAL event, so it turns read-only; but its local
//     data is never dropped without a durable remote copy, so it stays local and served.
//   - A query on a partition already served from cold storage fails, "cold-storage download
//     failed"; queries on local partitions are unaffected.
//   - Each nightly backup fails and is recorded as failed in backups(); nothing retries it
//     until the next schedule. The WAL cleaner finds no new backup and deletes nothing.
// On recovery the backlog goes up in txn order, the replica catches up, the client gets one
// cumulative durable ack and trims, pending partitions upload, and seals complete.

import { ttlOf } from "../fig1-partitions/model.mjs";
import { GRAIN } from "../fig8-backups/backup.mjs";

export { GRAIN };
export const W0 = 60 + 20 / 24; // 2026-10-21 20:00, the store becomes unreachable
export const W1 = W0 + 3; // three days later it is back
export const CATCH_UP = 0.4; // the backlog worked off, as drawn
export const U_START = 60.3;
export const U_END = W1 + 1.3;
export const FAILED = [61, 62, 63]; // the nightly backups that fail
// the cluster from Fig 8, with no instance able to do manager work while the store is down
export const C7 = {
  lanes: [0, 1],
  manager: 0,
  schedule: { name: "outage", period: 1e6, segments: [
    { from: 0, to: W0, manager: 0, down: -1 },
    { from: W0, to: W1, manager: -1, down: -1 },
    { from: W1, to: 1e6, manager: 0, down: -1 },
  ] },
};
// the durable-ACK client's buffer, for an example ingest of 4 MB a minute
export const SF_CAP_GIB = 10;
export const INGEST_MB_MIN = 4;
const GIB_PER_DAY = (INGEST_MB_MIN * 60 * 24) / 1024;

export const phaseOf = (u) => (u < W0 ? "before" : u < W1 ? "outage" : u < W1 + CATCH_UP ? "catchup" : "after");

// What the client has buffered, in GiB: it grows until the store is back, capped, and the
// cumulative durable ack after recovery trims it in one go.
export function bufferOf(u) {
  const base = 0.02;
  if (u < W0) return base;
  const grown = Math.min(SF_CAP_GIB, base + (Math.min(u, W1) - W0) * GIB_PER_DAY);
  if (u < W1) return grown;
  const f = Math.min(1, (u - W1) / (CATCH_UP * 0.6));
  return grown + (base - grown) * f;
}
export const fullAt = W0 + (SF_CAP_GIB - 0.02) / GIB_PER_DAY; // when the buffer fills

// How far behind the store the replica is, in days.
export function lagOf(u) {
  if (u < W0) return 0;
  if (u < W1) return u - W0;
  const f = Math.min(1, (u - W1) / CATCH_UP);
  return (W1 - W0) * (1 - f);
}

// Local WAL the primary holds because it could not upload it, in days of writes.
export function backlogOf(u) {
  if (u < W0) return 0;
  if (u < W1) return u - W0;
  return Math.max(0, (W1 - W0) * (1 - (u - W1) / CATCH_UP));
}

// Partitions waiting on the store at u: due TO REMOTE but not uploaded, and past DROP LOCAL
// (sealed) but still local.
export function waitingOf(u, partitions, eventsOf) {
  let upload = 0, local = 0;
  for (const p of partitions) {
    const e = eventsOf(GRAIN, p, C7);
    if (u > p + 1 + ttlOf(GRAIN, 0, p) + 0.005 && u < e.up) upload++;
    if (u >= e.seal && u < e.cold[0]) local++;
  }
  return { upload, local };
}

