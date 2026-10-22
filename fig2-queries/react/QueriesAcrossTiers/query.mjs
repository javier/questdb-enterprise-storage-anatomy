// The model behind Fig 2: one SELECT on the trades table from Fig 1, while the cluster
// keeps running (PARTITION BY DAY, TO REMOTE 1 HOUR, TO PARQUET 3 DAYS, DROP LOCAL 1 MONTH).
//
// The instance that receives the query (here the primary) serves every partition it can from its
// own disk and the rest from the object store; the query itself never names a tier.
//   Native partition: it reads only the files of the projected columns, and within them
//   only the rows in the time range (the designated timestamp is sorted).
//   Parquet partition, local or cold: it reads data.parquet using the _pm metadata, which
//   maps each row group and column chunk to a byte range; it reads only the chunks of the
//   projected columns in the row groups that overlap the time range.
//   Local Parquet reads those ranges from local disk. A cold partition reads exactly those
//   byte ranges from the object store, adjacent ranges coalesced into one request.
//   A partition with a copy in the object store that has not reached DROP LOCAL is still
//   read from local disk.
// Every range is relative to now, so as time runs the same query moves across the tiers.

import { SINGLE, laneState, nameOf, storeState } from "./fig1/model.mjs";
import { ROW_GROUPS } from "./fig1/parts.mjs";

export const GRAIN = "DAY";
export const SERVER = 0; // the primary runs the query
export const C = SINGLE; // one instance; replicas arrive in Fig 4

// Projected columns, in file order, and the column-file bars each one maps to.
export const COLUMNS = [
  { name: "ts", bars: [0] },
  { name: "symbol", bars: [1] },
  { name: "price", bars: [2] },
  { name: "amount", bars: [3] },
  { name: "venue", bars: [4, 5] },
];
export const DEFAULT_COLS = ["ts", "symbol", "price"];

// Ranges as ages in days, newest first: [youngest, oldest].
export const RANGES = [
  { key: "12h", label: "LAST 12 HOURS", ages: [0, 0.5], where: "ts IN '$now-12h..$now'" },
  { key: "7d", label: "LAST 7 DAYS", ages: [0, 7], where: "ts IN '$now-7d..$now'" },
  { key: "45d", label: "LAST 45 DAYS", ages: [0, 45], where: "ts IN '$now-45d..$now'" },
  { key: "mid", label: "20 TO 40 DAYS AGO", ages: [20, 40], where: "ts IN '$now-40d..$now-20d'" },
  { key: "old", label: "35 TO 50 DAYS AGO", ages: [35, 50], where: "ts IN '$now-50d..$now-35d'" },
];
export const DEFAULT_RANGE = "45d";

// The idle tour: when nobody is driving, the figure steps through these on its own, so
// each tier shows up in turn and column picks change what is read.
export const TOUR = [
  ["45d", ["ts", "symbol", "price"]],
  ["12h", ["ts", "symbol", "price"]],
  ["7d", ["ts", "price"]],
  ["mid", ["ts", "symbol", "price"]],
  ["old", ["ts", "price", "venue"]],
  ["45d", ["ts", "amount"]],
];
export const rangeOf = (key) => RANGES.find((r) => r.key === key);

export const sqlOf = (range, cols) => `SELECT ${cols.join(", ")} FROM trades WHERE ${range.where}`;
// The same SQL as markup, with each quoted literal kept on one line when it wraps.
export const sqlHtml = (range, cols) => sqlOf(range, cols).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'[^']*'/g, (s) => `<span style="white-space:nowrap">${s}</span>`);

// Where partition p is read from at time u, on the instance running the query. A partition
// still dropping its local data reads locally until the drop completes.
export function tierOf(p, u) {
  const s = laneState(GRAIN, p, SERVER, u, C);
  if (s.evict >= 1) return "cold";
  if (s.m >= 1) return "parquet";
  return "native";
}
export const hasRemoteCopy = (p, u) => storeState(GRAIN, p, u, C).lift >= 1;

// The queried part of partition p, as a fraction of its time span, or null.
export function spanOf(p, range, u) {
  const from = u - range.ages[1], to = u - range.ages[0];
  const a = Math.max(from, p), b = Math.min(to, p + 1, u);
  return b > a ? [a - p, b - p] : null;
}

export const barsOf = (cols) => {
  const bars = [false, false, false, false, false, false];
  for (const c of COLUMNS) if (cols.includes(c.name)) for (const b of c.bars) bars[b] = true;
  return bars;
};
// Runs of adjacent projected columns: each run is one contiguous byte range per row group.
export const columnRuns = (cols) => {
  let runs = 0, prev = false;
  for (const c of COLUMNS) { const on = cols.includes(c.name); if (on && !prev) runs++; prev = on; }
  return runs;
};
export const groupsOf = ([f0, f1]) => {
  let n = 0;
  for (let g = 0; g < ROW_GROUPS; g++) if ((g + 1) / ROW_GROUPS > f0 && g / ROW_GROUPS < f1) n++;
  return n;
};
export const filesOf = (cols) => COLUMNS.filter((c) => cols.includes(c.name)).reduce((n, c) => n + c.bars.length, 0);

// The whole query at time u: what each tier contributes.
export function planOf(range, cols, partitions, u) {
  const plan = { native: { parts: 0, files: 0 }, parquet: { parts: 0, chunks: 0 }, cold: { parts: 0, chunks: 0, requests: 0 } };
  for (const p of partitions) {
    const span = spanOf(p, range, u);
    if (!span) continue;
    const tier = tierOf(p, u);
    if (tier === "native") { plan.native.parts++; plan.native.files += filesOf(cols); continue; }
    const groups = groupsOf(span);
    plan[tier].parts++;
    plan[tier].chunks += groups * cols.length;
    if (tier === "cold") plan.cold.requests += groups * columnRuns(cols);
  }
  return plan;
}

const many = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
export function planText(plan) {
  const out = [];
  if (plan.native.parts) out.push(`native: ${many(plan.native.parts, "partition")}, ${many(plan.native.files, "column file")}`);
  if (plan.parquet.parts) out.push(`local Parquet: ${many(plan.parquet.parts, "partition")}, ${many(plan.parquet.chunks, "chunk")}`);
  if (plan.cold.parts) out.push(`from cold storage: ${many(plan.cold.parts, "partition")}, ${many(plan.cold.chunks, "chunk")} in ${many(plan.cold.requests, "range read")}`);
  return out.join(" · ") || "no partitions in range";
}

export function readText(p, range, cols, u) {
  const span = spanOf(p, range, u);
  const name = nameOf(GRAIN, p);
  const tier = tierOf(p, u);
  if (!span) return `${name} · outside the time range, pruned`;
  if (tier === "native") return `${name} · native on local disk · reads ${many(filesOf(cols), "column file")}`;
  const groups = groupsOf(span);
  const chunks = `${groups} of ${ROW_GROUPS} row groups × ${many(cols.length, "column")} = ${many(groups * cols.length, "chunk")}`;
  if (tier === "parquet") return `${name} · Parquet on local disk${hasRemoteCopy(p, u) ? ", its copy in cold storage not used" : ""} · ${chunks}`;
  return `${name} · local data dropped, read from cold storage · ${chunks}, fetched in ${many(groups * columnRuns(cols), "range read")}`;
}
