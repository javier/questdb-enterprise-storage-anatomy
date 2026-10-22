// The model behind Fig 6's WAL view: replication through the object store, in real seconds.
// Defaults as the code sets them (EntPropServerConfiguration) and the uploader
// (wal/uploader/mod.rs):
//   cairo.wal.segment.rollover.size          2 MiB   a segment closes and uploads at this size
//   replication.primary.throttle.window      1 s     an incomplete segment is flushed anyway;
//                                                    it is uploaded again as it grows (the
//                                                    uploader counts that as write amplification).
//                                                    The tuning docs still say 10 s.
//   replication.replica.poll.interval        1 s     each replica checks index.msgpack
//   replication.primary.sequencer.part.txn.count  5000 transactions per _txn_parts file
//   index.msgpack PUTs are coalesced across tables, at most one per 10 ms (1 s on GCS).
//   WAL uploads are zstd compressed, about 8x (a 2 MiB segment is about 256 KiB stored).
// Object keys: {table}/wal{N}/{segment}.tar.zst, {table}/_txn_parts/{part}.zst, index.msgpack.
//
// A small deterministic simulation: commits arrive at the primary at a steady rate; the
// open segment grows; uploads land in the store and update the index; replicas poll on
// their own clocks, download what is new and apply it.

export const KiB = 1024, MiB = 1024 * 1024;
export const SEGMENT_MAX = 2 * MiB;
export const THROTTLE = 1;
export const POLL = 1;
export const TXN_PART = 5000;
export const ZSTD = 8;
// The view runs in real time.
export const SPEED = 1;
// How long each transfer takes in the model, kept short and plausible; the drawing uses
// VIS instead, so each flight stays on screen long enough to follow.
export const TIMES = { upload: 0.15, download: 0.12, apply: 0.05 };
export const VIS = { upload: 0.55, download: 0.5, ping: 0.4, flash: 0.5 };

// Light load: the open segment grows slowly and is uploaded again every second.
// Heavy load: about 1 MiB/s, so segments fill to 2 MiB in about 2 s and roll over.
export const LOADS = {
  light: { label: "LIGHT LOAD", every: 0.5, bytes: 16 * KiB },
  heavy: { label: "HEAVY LOAD", every: 0.05, bytes: 48 * KiB },
};
export const LOAD_ORDER = ["light", "heavy"];

// Two settings for the window and the poll. The defaults keep replicas within about 2 s;
// tuned down to 250 ms each, within about 1 s, at the cost of more object store requests
// (one upload per window, one index read per poll). 250 ms is allowed on S3 and Azure; on
// GCS the window must stay at 1 s or more.
export const TUNINGS = {
  fast: { label: "LOW LATENCY · 250 MS", throttle: 0.25, poll: 0.25 },
  defaults: { label: "DEFAULTS · 1 S", throttle: THROTTLE, poll: POLL },
};
export const TUNING_ORDER = ["fast", "defaults"];

// the two replicas poll on their own clocks, as fractions of the poll interval
const PHASES = [0.15, 0.62];

export function makeSim(loadKey = "light", t0 = 0, tuningKey = "fast") {
  const T = TUNINGS[tuningKey];
  const s = {
    t: t0,
    load: loadKey,
    tuning: tuningKey,
    throttle: T.throttle,
    poll: T.poll,
    txn: 1240,
    nextCommit: t0 + 0.3,
    commits: new Map(), // txn -> commit time, recent ones only
    seg: { id: 7, bytes: 0, from: 1241, to: 1240 },
    pendingSince: null, // first commit not yet uploaded
    uploads: [], // in flight: { seg, to, bytes, t0, final }
    bay: [], // objects in the store: { seg, bytes, final, at }
    index: { txn: 1240, at: -9 },
    replicas: PHASES.map((phase, n) => ({ i: n + 1, phase, nextPoll: t0 + phase * T.poll, applied: 1240, busy: null, polledAt: -9, appliedAt: -9, seenAt: -9 })),
    events: [], // recent things that happened, for labels: { kind, t, ... }
  };
  for (let n = 6; n >= 2; n--) s.bay.push({ seg: n, bytes: SEGMENT_MAX / ZSTD, final: true, at: -9 });

  function upload(final) {
    const seg = s.seg;
    s.uploads.push({ seg: seg.id, to: seg.to, bytes: seg.bytes / ZSTD, raw: seg.bytes, t0: s.t, final });
    s.pendingSince = null;
    s.events.push({ kind: final ? "rollover" : "flush", t: s.t, seg: seg.id });
  }

  function step(dt) {
    const end = s.t + dt;
    while (s.t < end) {
      const h = Math.min(0.02, end - s.t);
      s.t += h;
      const L = LOADS[s.load];
      // commits into the open segment
      while (s.nextCommit <= s.t) {
        s.txn++;
        s.commits.set(s.txn, s.nextCommit);
        s.seg.bytes += L.bytes;
        s.seg.to = s.txn;
        if (s.pendingSince === null) s.pendingSince = s.nextCommit;
        s.nextCommit += L.every;
        if (s.seg.bytes >= SEGMENT_MAX) {
          s.seg.bytes = SEGMENT_MAX;
          upload(true);
          s.seg = { id: s.seg.id + 1, bytes: 0, from: s.txn + 1, to: s.txn };
        }
      }
      // the throttle window flushes the open segment, which stays open and keeps growing
      if (s.pendingSince !== null && s.t - s.pendingSince >= s.throttle) upload(false);
      // uploads landing: the object replaces any earlier copy of the same segment
      for (const u of s.uploads) {
        if (u.done || s.t < u.t0 + TIMES.upload) continue;
        u.done = true;
        const at = s.bay.findIndex((o) => o.seg === u.seg);
        const obj = { seg: u.seg, bytes: u.bytes, final: u.final, at: s.t };
        if (at >= 0) s.bay[at] = obj;
        else s.bay.push(obj);
        s.index = { txn: Math.max(s.index.txn, u.to), at: s.t };
      }
      // kept a little longer than the transfer, for the drawing
      s.uploads = s.uploads.filter((u) => !u.done || s.t < u.t0 + Math.max(TIMES.upload, VIS.upload));
      s.bay.sort((a, b) => a.seg - b.seg);
      while (s.bay.length > 8) s.bay.shift();
      // replicas: poll the index on their own clock; download and apply what is new
      for (const r of s.replicas) {
        if (r.busy && s.t >= r.busy.t0 + TIMES.download + TIMES.apply) {
          r.applied = r.busy.to;
          r.appliedAt = s.t;
          r.busy = null;
        }
        if (s.t >= r.nextPoll) {
          r.nextPoll += s.poll;
          r.polledAt = s.t;
          if (!r.busy && s.index.txn > r.applied) {
            // it downloads every object that landed since it last looked
            r.busy = { t0: s.t, to: s.index.txn, segs: s.bay.filter((o) => o.at > r.seenAt).map((o) => o.seg) };
            r.lastDown = r.busy; // kept after the transfer, for the drawing
            r.seenAt = s.t;
          }
        }
      }
      for (const [txn, at] of s.commits) if (at < s.t - 120) s.commits.delete(txn);
      s.events = s.events.filter((e) => e.t > s.t - 3);
    }
  }

  // How far behind replica r is: transactions, and seconds since the oldest one it lacks.
  function lagOf(r) {
    const txns = s.txn - r.applied;
    const first = s.commits.get(r.applied + 1);
    return { txns, seconds: txns > 0 && first !== undefined ? s.t - first : 0 };
  }

  const setTuning = (key) => {
    const T2 = TUNINGS[key];
    s.tuning = key;
    s.throttle = T2.throttle;
    s.poll = T2.poll;
    for (const r of s.replicas) r.nextPoll = Math.min(r.nextPoll, s.t + r.phase * s.poll);
  };
  return { s, step, lagOf, setTuning, setLoad: (k) => { s.load = k; s.nextCommit = Math.max(s.nextCommit, s.t); } };
}

const n = (x) => x.toLocaleString("en-US");
export const sizeOf = (bytes) => (bytes >= MiB ? (bytes / MiB).toFixed(1) + " MiB" : Math.round(bytes / KiB) + " KiB");
export const txnText = (x) => n(x);
export const partOf = (txn) => Math.floor(txn / TXN_PART);
