// The model behind Fig 1: one Enterprise table on a three-instance cluster,
//   trades(ts TIMESTAMP, symbol SYMBOL INDEX, price DOUBLE, amount DOUBLE, venue VARCHAR)
// with a storage policy whose stages are independent of each other. The default is the
// common shape: PARTITION BY DAY with TO REMOTE 1 HOUR, TO PARQUET 3 DAYS, DROP LOCAL 1 MONTH.
//
// A stage is due once partition_end < min(now, latest_ts) - TTL (with live ingestion
// latest_ts is about now). Each instance runs its own storage policy check every 5
// minutes, so it acts at its first check after that (StoragePolicyCheckJob.walkPartitions):
//   TO REMOTE   only the cold storage manager (here replica 2) uploads a Parquet snapshot,
//               once for the whole cluster. Every instance keeps its local copy as it is.
//   TO PARQUET  every instance converts its own local copy.
//   DROP LOCAL  the primary emits PARTITION_SEAL into the WAL, which replicates like any
//               WAL through the object store; the manager marks the copy Sealed; then each
//               instance drops its local data and keeps only _pm and the symbol index.
// Replication itself is continuous: the primary uploads WAL segments to the object store
// within seconds and the replicas download them; no schedule.
//
// Time u is measured in partition widths: partition p covers [p, p + 1). Every
// animation is a pure function of u, so pause, skip and replay are exact.

export const PRESETS = {
  HOUR: {
    name: "HOUR", minutes: 60, a0: 0.5, start: 48.35,
    stages: [["TO REMOTE", "1 HOUR", "1h"], ["TO PARQUET", "6 HOURS", "6h"], ["DROP LOCAL", "1 DAY", "1d"]],
  },
  DAY: {
    name: "DAY", minutes: 1440, a0: 0.25, start: 60.3,
    stages: [["TO REMOTE", "1 HOUR", "1h"], ["TO PARQUET", "3 DAYS", "3d"], ["DROP LOCAL", "1 MONTH", "1M"]],
  },
  MONTH: {
    name: "MONTH", minutes: 43830, a0: 0.25, start: 24.3,
    stages: [["TO REMOTE", "1 DAY", "1d"], ["TO PARQUET", "1 MONTH", "1M"], ["DROP LOCAL", "1 YEAR", "1Y"]],
  },
};
export const GRAIN_ORDER = ["HOUR", "DAY", "MONTH"];
export const policySql = (g) => "PARTITION BY " + g + " · STORAGE POLICY(" + PRESETS[g].stages.map(([s, t]) => s + " " + t).join(", ") + ")";

export const INSTANCES = [
  { name: "primary", check: 0.4 },
  { name: "replica 1", check: 2.2 },
  { name: "replica 2", check: 3.9, manager: true },
];
export const PRIMARY = 0;
export const MANAGER = 2;
// Which instances a figure shows, as indices into INSTANCES and the bench slots, and which
// one holds the cold storage manager role. A single instance is its own manager.
export const CLUSTER = { lanes: [0, 1, 2], manager: MANAGER };
export const SINGLE = { lanes: [0], manager: PRIMARY };
const CHECK_MINUTES = 5;

export const UNIT_SECONDS = 2.5;
const SEC = 1 / UNIT_SECONDS;
export const ANIM = { morph: 1.0 * SEC, lift: 1.5 * SEC, evict: 0.9 * SEC, lamp: 0.4 * SEC };
// The WAL stream: a segment every PERIOD, up to the store in UP, each replica fetches it.
export const WAL = { period: 0.42 * SEC, up: 0.5 * SEC, wait: [0, 0.08 * SEC, 0.16 * SEC], down: 0.5 * SEC, keep: 9 };

// Calendar. Each preset's start maps to 2026-10-21; u counts partitions from there.
const two = (n) => String(n).padStart(2, "0");
const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export function dateOf(g, u) {
  const s = Math.floor(PRESETS[g].start);
  if (g === "HOUR") return new Date(Date.UTC(2026, 9, 21, 8) + (u - s) * 3600e3);
  if (g === "DAY") return new Date(Date.UTC(2026, 9, 21) + (u - s) * 86400e3);
  const m = Math.floor(u) - s + 2026 * 12 + 9;
  const y = Math.floor(m / 12), mo = m % 12;
  return new Date(Date.UTC(y, mo, 1) + (u - Math.floor(u)) * daysIn(y, mo) * 86400e3);
}
const unitsBetween = (g, a, b) => {
  if (g === "MONTH") return null;
  return (b - a) / (g === "HOUR" ? 3600e3 : 86400e3);
};

// The exact TTL of stage k for partition p, in partition widths (calendar months vary).
export function ttlOf(g, k, p) {
  const end = dateOf(g, p + 1 + 1e-9);
  if (g === "HOUR") return [1, 6, 24][k];
  if (g === "DAY") {
    if (k === 0) return 1 / 24;
    if (k === 1) return 3;
    const later = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate());
    return unitsBetween(g, end.getTime(), later);
  }
  if (k === 0) return 1 / daysIn(end.getUTCFullYear(), end.getUTCMonth());
  return [0, 1, 12][k];
}
// The nominal TTLs, where the marks on the floor are drawn.
export const nominal = (g) => ({ HOUR: [1, 6, 24], DAY: [1 / 24, 3, 30], MONTH: [1 / 30.44, 1, 12] })[g];
export const axisEnd = (g) => 2 * nominal(g)[2];

const minutesToU = (g, m) => m / PRESETS[g].minutes;
export function nextCheck(g, i, t) {
  const step = minutesToU(g, CHECK_MINUTES);
  const phase = minutesToU(g, INSTANCES[i].check);
  return phase + Math.ceil((t - phase) / step - 1e-9) * step;
}
// the first WAL segment at or after t, and when instance i has applied it
export const segmentAfter = (t) => Math.ceil(t / WAL.period - 1e-9);
export const appliedAt = (n, i) => n * WAL.period + (i === PRIMARY ? 0 : WAL.up + WAL.wait[i] + WAL.down);

// When each thing happens to partition p, as u values. C is the cluster in the figure.
export function eventsOf(g, p, C = CLUSTER) {
  const M = C.manager;
  const end = p + 1;
  const up = nextCheck(g, M, end + ttlOf(g, 0, p));
  const upDone = up + ANIM.lift;
  const conv = INSTANCES.map((_, i) => nextCheck(g, i, end + ttlOf(g, 1, p)));
  const seal = nextCheck(g, PRIMARY, end + ttlOf(g, 2, p));
  const sealSeg = segmentAfter(seal);
  const sealIn = INSTANCES.map((_, i) => (i === PRIMARY ? seal : appliedAt(sealSeg, i)));
  const sealed = nextCheck(g, M, Math.max(sealIn[M], upDone));
  const cold = INSTANCES.map((_, i) => nextCheck(g, i, sealed));
  return { end, up, upDone, conv, seal, sealSeg, sealIn, sealed, cold };
}

const unit01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const span = (u, from, length) => unit01((u - from) / length);

export function laneState(g, p, i, u, C = CLUSTER) {
  const e = eventsOf(g, p, C);
  return { active: u < e.end, m: span(u, e.conv[i], ANIM.morph), sealed: span(u, e.sealIn[i], ANIM.morph * 0.5), evict: span(u, e.cold[i], ANIM.evict) };
}
export function storeState(g, p, u, C = CLUSTER) {
  const e = eventsOf(g, p, C);
  return { lift: u < e.up ? -1 : span(u, e.up, ANIM.lift), sealed: u >= e.sealed };
}
// Did an instance's policy check do work at about time u (for its lamp)?
export function lampOf(g, i, u, partitions, C = CLUSTER) {
  let best = 0;
  for (const p of partitions) {
    const e = eventsOf(g, p, C);
    const times = [e.conv[i], e.cold[i]];
    if (i === C.manager) times.push(e.up, e.sealed);
    if (i === PRIMARY) times.push(e.seal);
    for (const t of times) if (u >= t && u < t + ANIM.lamp) best = Math.max(best, 1 - (u - t) / ANIM.lamp);
  }
  return best;
}

// Partitions on the benches at time u, oldest first.
export function partitionsAt(g, u) {
  const out = [];
  for (let p = Math.floor(u - axisEnd(g)) - 1; p <= Math.floor(u); p++) out.push(p);
  return out;
}

export function clockOf(g, u) {
  const d = dateOf(g, u + 1e-9);
  // coarse enough to read while it runs: 5 minutes for HOUR, the hour for DAY, the day for MONTH
  const day = d.getUTCFullYear() + "-" + two(d.getUTCMonth() + 1) + "-" + two(d.getUTCDate());
  if (g === "MONTH") return day;
  const min = g === "HOUR" ? Math.floor(d.getUTCMinutes() / 5) * 5 : 0;
  return day + " " + two(d.getUTCHours()) + ":" + two(min);
}
export function nameOf(g, p) {
  const d = dateOf(g, p + 1e-9);
  const ym = d.getUTCFullYear() + "-" + two(d.getUTCMonth() + 1);
  if (g === "MONTH") return ym;
  if (g === "DAY") return ym + "-" + two(d.getUTCDate());
  return ym + "-" + two(d.getUTCDate()) + "T" + two(d.getUTCHours());
}
export function durationOf(g, du) {
  const m = Math.max(1, Math.ceil(du * PRESETS[g].minutes - 1e-6));
  if (m <= 55) return Math.ceil(m / 5) * 5 + "m"; // the policy checks every 5 minutes
  if (m < 1440) return Math.ceil(m / 60) + "h";
  const days = Math.round(m / 1440);
  if (days < 45) return days + "d";
  return Math.round(days / 30.44) + " months";
}

// One line about partition p, for the readout.
export function partitionText(g, p, u, C = CLUSTER) {
  const e = eventsOf(g, p, C);
  const name = nameOf(g, p);
  const n = C.lanes.length;
  const lanes = C.lanes.map((i) => laneState(g, p, i, u, C));
  const count = (f) => lanes.filter(f).length;
  // "on all 3" for a cluster; nothing to add for a single instance
  const all = n === 1 ? "" : " on all " + n;
  const some = (c) => (n === 1 ? "" : " on " + c + " of " + n);
  const age = u - e.end;
  const st = storeState(g, p, u, C);
  const next = PRESETS[g].stages.map(([s], k) => ({ s, at: ttlOf(g, k, p) })).filter(({ at }) => age < at).sort((a, b) => a.at - b.at)[0];
  const until = next ? " · " + next.s + " in " + durationOf(g, next.at - age) : "";
  const uploader = n === 1 ? "uploading it as Parquet" : "manager uploading it as Parquet";
  const copy = st.lift >= 1 ? "Parquet partition in the object store" : st.lift >= 0 ? uploader : "not in the object store yet";
  if (lanes[0].active) return name + " · active, native" + all + until;
  const cold = count((s) => s.evict >= 1);
  if (cold === n) return name + " · local data dropped" + all + ", _pm and index kept, reads go to the object store";
  if (cold > 0) return name + " · local data dropped" + some(cold);
  if (count((s) => s.sealed > 0) > 0) return name + (n === 1 ? " · sealed read-only, local data drops next" : " · sealed through the WAL, each instance drops its local data next");
  const parquet = count((s) => s.m >= 1);
  const local = parquet === 0 ? "native" + all : parquet === n ? "Parquet" + all : "Parquet" + some(parquet);
  return name + " · local: " + local + " · " + copy + until;
}

// The next policy work anywhere, for the idle readout.
// Every stage has its own next due time, so all three show, in policy order.
export function nextWorkText(g, u) {
  return PRESETS[g].stages
    .map(([s], k) => {
      let at = Infinity;
      for (const p of partitionsAt(g, u)) {
        const t = p + 1 + ttlOf(g, k, p);
        if (t > u + 1e-9 && t < at) at = t;
      }
      return at < Infinity ? s + " in " + durationOf(g, at - u) : "";
    })
    .filter(Boolean)
    .join(" · ")
    .replace(/^/, "next: ");
}
