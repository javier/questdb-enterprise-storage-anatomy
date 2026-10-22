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
// The fourth stage, DROP REMOTE: the partition leaves the table, and cold storage GC reclaims
// its remote objects after a grace period. Only Fig 1 draws it: its build and live code set
// POLICY.dropRemote before anything else runs, and every figure runs its own copy of this
// module, so the others keep three stages and their axis.
export const POLICY = { dropRemote: false };
// Remote retention is long by design: a year at least; three for monthly partitions, whose
// DROP LOCAL is already a year.
export const DROP_REMOTE = { HOUR: ["DROP REMOTE", "1 YEAR", "1Y"], DAY: ["DROP REMOTE", "1 YEAR", "1Y"], MONTH: ["DROP REMOTE", "3 YEARS", "3Y"] };
export const GC_GRACE_MINUTES = 30; // cold.storage.gc.partition.grace.period
export const stagesOf = (g) => (POLICY.dropRemote ? [...PRESETS[g].stages, DROP_REMOTE[g]] : PRESETS[g].stages);
export const policySql = (g) => "PARTITION BY " + g + " · STORAGE POLICY(" + stagesOf(g).map(([s, t]) => s + " " + t).join(", ") + ")";

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
  if (g === "HOUR") return [1, 6, 24, 8760][k];
  if (g === "DAY") {
    if (k === 0) return 1 / 24;
    if (k === 1) return 3;
    const months = k === 2 ? 1 : 12;
    const later = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + months, end.getUTCDate());
    return unitsBetween(g, end.getTime(), later);
  }
  if (k === 0) return 1 / daysIn(end.getUTCFullYear(), end.getUTCMonth());
  return [0, 1, 12, 36][k];
}
// The nominal TTLs, where the marks on the floor are drawn.
const NOMINAL = { HOUR: [1, 6, 24, 8760], DAY: [1 / 24, 3, 30, 365.25], MONTH: [1 / 30.44, 1, 12, 36] };
// With a year on the log axis, partitions older than this are thinner than a pixel: they are
// drawn as one strip instead of one by one (see scene.mjs).
export const DRAW_AGE = { HOUR: 80, DAY: 110, MONTH: 48 };
export const nominal = (g) => NOMINAL[g].slice(0, POLICY.dropRemote ? 4 : 3);
// the axis runs a little past the last stage, so a partition is seen leaving
export const axisEnd = (g) => (POLICY.dropRemote ? 1.12 * NOMINAL[g][3] : 2 * NOMINAL[g][2]);

const minutesToU = (g, m) => m / PRESETS[g].minutes;
export function nextCheck(g, i, t) {
  const step = minutesToU(g, CHECK_MINUTES);
  const phase = minutesToU(g, INSTANCES[i].check);
  return phase + Math.ceil((t - phase) / step - 1e-9) * step;
}
// A cluster can carry a schedule, repeating every C.schedule.period, of which instance holds
// the cold storage manager role (manager: -1 while none does) and which instance is down:
//   { period, segments: [{ from, to, manager, down }] }, the segments tiling [0, period).
// A check by instance i then waits until i is up, and manager work waits for whoever holds
// the role at that moment; with no manager nothing is uploaded, sealed or reclaimed.
function segmentAt(C, t) {
  const { period, segments } = C.schedule;
  const n = Math.floor(t / period), r = t - n * period;
  const s = segments.find((x) => r >= x.from - 1e-9 && r < x.to - 1e-9) ?? segments[segments.length - 1];
  return { ...s, from: n * period + s.from, to: n * period + s.to };
}
// instance i's first policy check at or after t, skipping the time it is down
export function checkOf(g, C, i, t) {
  if (!C.schedule) return nextCheck(g, i, t);
  for (let guard = 0; guard < 64; guard++) {
    const s = segmentAt(C, t);
    if (s.down === i) { t = s.to; continue; }
    const c = nextCheck(g, i, t);
    if (c < s.to) return c;
    t = s.to;
  }
  return Infinity;
}
// the manager's first check at or after t, and who that is
export function managerCheck(g, C, t) {
  if (!C.schedule) return { at: nextCheck(g, C.manager, t), by: C.manager };
  for (let guard = 0; guard < 64; guard++) {
    const s = segmentAt(C, t);
    if (s.manager >= 0 && s.down !== s.manager) {
      const c = nextCheck(g, s.manager, Math.max(t, s.from));
      if (c < s.to) return { at: c, by: s.manager };
    }
    t = s.to;
  }
  return { at: Infinity, by: C.manager };
}
export const managerAt = (C, t) => (C.schedule ? segmentAt(C, t) : { manager: C.manager, down: -1 });

// Fig 5's manager scenarios, in partition widths (days), each ending where it began. From
// operations/cold-storage.md: a handoff is TO REFRESHER on the manager (it flushes and
// releases _manager.lock), then TO MANAGER on the replacement; uploads and GC pause between.
// If the manager dies nothing takes over: a restarted instance finds the foreign lock and
// stays a refresher, so an operator proves the old one dead and uses TO MANAGER FORCE.
const ROLE = "SWITCH COLD STORAGE ROLE TO ";
export const MANAGER_MODES = {
  steady: { label: "STEADY", schedule: null, commands: [] },
  handoff: {
    label: "HANDOFF",
    schedule: { name: "handoff", period: 8, segments: [
      { from: 0, to: 0.3, manager: -1, down: -1 }, { from: 0.3, to: 3.98, manager: 2, down: -1 },
      { from: 3.98, to: 4.3, manager: -1, down: -1 }, { from: 4.3, to: 7.98, manager: 1, down: -1 },
      { from: 7.98, to: 8, manager: -1, down: -1 },
    ] },
    commands: [[0.3, 2, ROLE + "MANAGER"], [3.98, 2, ROLE + "REFRESHER"], [4.3, 1, ROLE + "MANAGER"], [7.98, 1, ROLE + "REFRESHER"]],
  },
  dies: {
    label: "MANAGER DIES",
    schedule: { name: "dies", period: 12, segments: [
      { from: 0, to: 0.3, manager: -1, down: -1 }, { from: 0.3, to: 3.5, manager: 2, down: -1 },
      { from: 3.5, to: 6, manager: -1, down: 2 }, { from: 6, to: 7.5, manager: 1, down: 2 },
      { from: 7.5, to: 11.7, manager: 1, down: -1 }, { from: 11.7, to: 12, manager: -1, down: -1 },
    ] },
    commands: [[0.3, 2, ROLE + "MANAGER"], [3.5, 2, "CRASH"], [6, 1, ROLE + "MANAGER FORCE"], [7.5, 2, "RESTARTED · foreign lock, stays a refresher"], [11.7, 1, ROLE + "REFRESHER"]],
  },
};
export const MANAGER_ORDER = ["steady", "handoff", "dies"];
export const clusterFor = (mode) => (MANAGER_MODES[mode].schedule ? { ...CLUSTER, schedule: MANAGER_MODES[mode].schedule } : CLUSTER);

// the first WAL segment at or after t, and when instance i has applied it
export const segmentAfter = (t) => Math.ceil(t / WAL.period - 1e-9);
export const appliedAt = (n, i) => n * WAL.period + (i === PRIMARY ? 0 : WAL.up + WAL.wait[i] + WAL.down);

// When each thing happens to partition p, as u values. C is the cluster in the figure.
const memo = new Map();
export function eventsOf(g, p, C = CLUSTER) {
  if (C.schedule) {
    const key = g + p + C.schedule.name;
    if (memo.has(key)) return memo.get(key);
    if (memo.size > 4000) memo.clear();
    const e = eventsOf0(g, p, C);
    memo.set(key, e);
    return e;
  }
  return eventsOf0(g, p, C);
}
function eventsOf0(g, p, C) {
  const end = p + 1;
  const upload = managerCheck(g, C, end + ttlOf(g, 0, p));
  const up = upload.at, upBy = upload.by;
  const upDone = up + ANIM.lift;
  const conv = INSTANCES.map((_, i) => checkOf(g, C, i, end + ttlOf(g, 1, p)));
  const seal = nextCheck(g, PRIMARY, end + ttlOf(g, 2, p));
  const sealSeg = segmentAfter(seal);
  const sealIn = INSTANCES.map((_, i) => (i === PRIMARY ? seal : appliedAt(sealSeg, i)));
  // the manager marks the uploaded partition Sealed once it has the seal and the upload
  const sealed = managerCheck(g, C, Math.max(C.schedule ? Math.max(...sealIn) : sealIn[C.manager], upDone)).at;
  const cold = INSTANCES.map((_, i) => checkOf(g, C, i, sealed));
  // DROP REMOTE: the partition leaves the table at the manager's check, and its objects are
  // reclaimed once the grace period has passed
  const gone = POLICY.dropRemote ? managerCheck(g, C, end + ttlOf(g, 3, p)).at : Infinity;
  const reclaimed = gone + minutesToU(g, GC_GRACE_MINUTES);
  return { end, up, upBy, upDone, conv, seal, sealSeg, sealIn, sealed, cold, gone, reclaimed };
}

const unit01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const span = (u, from, length) => unit01((u - from) / length);

export function laneState(g, p, i, u, C = CLUSTER) {
  const e = eventsOf(g, p, C);
  return { active: u < e.end, m: span(u, e.conv[i], ANIM.morph), sealed: span(u, e.sealIn[i], ANIM.morph * 0.5), evict: span(u, e.cold[i], ANIM.evict), gone: span(u, e.gone, ANIM.evict) };
}
// lift: the upload, 0..1; sealed; deleting: removed from the table, objects in their grace
// period; gone: 0..1 as the objects are reclaimed
export function storeState(g, p, u, C = CLUSTER) {
  const e = eventsOf(g, p, C);
  return { lift: u < e.up ? -1 : span(u, e.up, ANIM.lift), sealed: u >= e.sealed, deleting: u >= e.gone && u < e.reclaimed, gone: span(u, e.reclaimed, ANIM.evict) };
}
// Did an instance's policy check do work at about time u (for its lamp)?
export function lampOf(g, i, u, partitions, C = CLUSTER) {
  let best = 0;
  for (const p of partitions) {
    const e = eventsOf(g, p, C);
    const times = [e.conv[i], e.cold[i]];
    if (i === e.upBy) times.push(e.up);
    if (i === managerAt(C, e.sealed).manager) times.push(e.sealed, e.gone);
    if (i === PRIMARY) times.push(e.seal);
    for (const t of times) if (u >= t && u < t + ANIM.lamp) best = Math.max(best, 1 - (u - t) / ANIM.lamp);
  }
  return best;
}

// Partitions on the benches at time u, oldest first.
export function partitionsAt(g, u) {
  const out = [];
  const oldest = POLICY.dropRemote ? Math.max(u - axisEnd(g), u - DRAW_AGE[g]) : u - axisEnd(g);
  for (let p = Math.floor(oldest) - 1; p <= Math.floor(u); p++) out.push(p);
  return out;
}
// The next moment stage k falls due for any partition after u: the partitions around that
// stage's age are the only candidates, so nothing scans the whole axis.
export function nextDue(g, k, u) {
  let at = Infinity;
  const age = nominal(g)[k];
  for (let p = Math.floor(u - age - 3); p <= Math.floor(u - age + 2); p++) {
    const t = p + 1 + ttlOf(g, k, p);
    if (t > u + 1e-9 && t < at) at = t;
  }
  return at;
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
  if (u >= e.gone) return name + " · removed from the table by DROP REMOTE" + (st.deleting ? " · its objects are reclaimed in " + durationOf(g, e.reclaimed - u) : ", objects reclaimed");
  const next = stagesOf(g).map(([s], k) => ({ s, at: ttlOf(g, k, p) })).filter(({ at }) => age < at).sort((a, b) => a.at - b.at)[0];
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
  return stagesOf(g)
    .map(([s], k) => {
      const at = nextDue(g, k, u);
      return at < Infinity ? s + " in " + durationOf(g, at - u) : "";
    })
    .filter(Boolean)
    .join(" · ")
    .replace(/^/, "next: ");
}
