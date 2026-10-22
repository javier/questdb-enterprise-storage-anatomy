// The model behind Fig 1: two tables on one instance, local disk only, seen around midnight on
// 2026-11-20. Both take the same rows; they differ in one clause.
//   trades     PARTITION BY DAY WAL STORAGE POLICY(TO PARQUET 3 DAYS), native by default
//   trades_pq  PARTITION BY DAY FORMAT PARQUET WAL
//
// From the code (questdb/core cairo, cairo/wal, griffin and qdbr parquet_write; questdb-ent
// storage policy), checked 2026-10-22:
//   - Each writer appends to a WAL of its own, wal<N>, in segments: <N>/0 holds a .d per
//     column (.i for var-size) and _event, one record per transaction with its row range.
//     Writers never wait for each other; every table has its own WALs and sequencer.
//   - txn_seq/_txnlog gives every writer's commit one place in a single order, as (WAL,
//     segment, segment txn, commit time), 60 bytes a txn, in parts of 5,000.
//   - Apply walks _txnlog in that order and copies each transaction's rows from its own WAL
//     into the partition, then commits _txn with the seq_txn applied.
//   - trades: rows land in native column files, a file per column; the active partition
//     appends. TO PARQUET rewrites a partition three days past its end as data.parquet and
//     _pm in a new directory, <date>.<txn>; the symbol index is hard-linked across.
//   - trades_pq (FORMAT PARQUET, WAL tables only): every new partition is born Parquet, the
//     active one too. There is no native append: each apply is a Parquet merge (qdbr
//     parquet_write/update.rs). New rows merge into the last row group while it is small
//     (under a quarter of 100,000 rows) or start a new one; _pm gets a new snapshot; the
//     symbol index (.k/.v) is rebuilt from the Parquet data. TO PARQUET skips partitions
//     that are already Parquet, so this table has nothing to convert.
//   - Both tables keep the symbol dictionary at the table root; data.parquet stores the
//     strings in a dictionary keyed by the same symbol keys.
//   - A late row is applied like any other, in the sequencer's order, into the partition it
//     belongs to: into native column files, or merged into a Parquet partition's data.parquet
//     (the overlapping row group decoded, merged and re-encoded, or the rows added as a row
//     group), never back to native.

export const ROW_GROUPS = 4;
export const SLOT = 32; // a partition's file slot along x
export const WAL_SLOT = 9; // a WAL segment's cards are narrower

// Fig 1 starts from empty: five consecutive days, 2026-11-15 to 2026-11-19, written one after
// another, each table's partition for a day made by the first rows applied to it. Ingestion
// never stops. TO PARQUET 3 DAYS can only take 2026-11-15 once it is three days past its end
// (11-16 00:00), so at 2026-11-19 00:05, while the fifth day is being written.
export const DAYS = ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"];
export const DAY = 2.0; // seconds a day takes in the loop
export const T0 = 0.5; // 2026-11-15 00:00
// The fifth day is longer: its first rows are in before the check at 00:05, and more arrive
// while TO PARQUET runs.
export const T = { fly: 0.6, apply: 0.25, parquet: T0 + 4 * DAY + 1.75, stage: 1.6 };
const dayCommits = (writers, offsets, last) => DAYS.flatMap((_, k) => (k === DAYS.length - 1 ? last : offsets).map((o, i) => [writers[(k * offsets.length + i) % writers.length], T0 + k * DAY + o, `d${k}`]));
// Each commit is [writer, second, the day its rows belong to]; late ones are for an older day.
export const RUNS = {
  policy: { loop: T0 + 4 * DAY + 4.3, trades: dayCommits([1, 2, 3], [0.5, 1.3], [0.2, 1.0, 2.2]), pq: dayCommits([1, 2], [0.8, 1.6], [0.4, 1.3, 2.5]) },
  late: {
    loop: 8.4,
    trades: [[1, 0.6, "d4"], [2, 1.7, "d2"], [3, 2.8, "d4"], [1, 4.0, "d4"], [2, 5.2, "d0"], [3, 6.4, "d4"]],
    pq: [[1, 1.0, "d4"], [2, 1.9, "d2"], [1, 4.4, "d4"], [2, 5.4, "d0"]],
  },
};

export const COLUMNS = ["ts.d", "symbol.d", "price.d", "amount.d", "venue.d", "venue.i", "symbol.k", "symbol.v"];
export const WAL_FILES = ["_event", "_event.i", "ts.d", "symbol.d", "price.d", "amount.d", "venue.d", "venue.i"];

// The days, oldest first; both tables have a partition per day once its first rows land.
// Every partition directory carries the txn it was made at, <date>.<txn>, and TO PARQUET
// writes 2026-11-15 into a new one.
export const PARTS = DAYS.map((date, k) => ({ id: `d${k}`, date }));
export const SCENARIOS = { policy: { label: "APPEND + TO PARQUET", loop: RUNS.policy.loop }, late: { label: "LATE ROWS", loop: RUNS.late.loop } };
const DATE_OF = Object.fromEntries(PARTS.map((p) => [p.id, p.date]));

export const FILES = {
  wal: (n, f) => `wal${n}/0/${f} · ${f === "_event" ? "one record per transaction of this writer: segment txn, row range, min and max timestamp, new symbols" : f === "_event.i" ? "where each record starts in _event" : "this writer's rows for the column, appended as written; writers never wait for each other"}`,
  "seq/_txnlog": "_txnlog · every writer's commits in one order: per txn the WAL, segment, segment txn and commit time; 60 bytes a txn, parts of 5,000",
  "seq/_meta": "txn_seq/_meta · the schema as the sequencer sees it",
  "seq/_wal_index.d": "_wal_index.d · hands each new writer its WAL number",
  "seq/_txn_parts/": "_txn_parts/ · the txnlog in parts of 5,000 txns",
  "table/_meta": "_meta · the schema: columns, types, partitioning, designated timestamp, and the table's format, native or Parquet",
  "table/_txn": "_txn · the committed state: the seq_txn applied, row counts, and a 32-byte entry per partition (rows, Parquet and read-only flags, the .N suffix, size)",
  "table/_cv": "_cv · column versions and tops",
  "table/symbol.o": "symbol.o · the symbol dictionary's offsets, once for the table, native or Parquet",
  "table/symbol.c": "symbol.c · the symbol dictionary's strings",
  "table/symbol.k": "symbol.k (table) · string to key lookup",
  "table/symbol.v": "symbol.v (table) · the lookup's values",
  "partition/ts.d": "ts.d · the designated timestamp, 8 bytes a row, sorted",
  "partition/symbol.d": "symbol.d · int keys into the table's dictionary",
  "partition/symbol.k": "symbol.k · the index: per key, where its row ids start; kept in every form",
  "partition/symbol.v": "symbol.v · the index's row ids, in blocks; kept in every form",
  "partition/price.d": "price.d · a DOUBLE, 8 bytes a row",
  "partition/amount.d": "amount.d · a DOUBLE, 8 bytes a row",
  "partition/venue.d": "venue.d · VARCHAR bytes that do not fit inline",
  "partition/venue.i": "venue.i · 16 bytes a row: length, flags, prefix, offset into venue.d",
  "partition/_pm": "_pm · QuestDB's sidecar: every chunk's byte range, codec and min/max, so a read knows which ranges to fetch; a new snapshot on every change",
  "partition/data.parquet": "data.parquet · row groups of 100,000 rows, a chunk per column, LZ4_RAW; symbols as strings in a dictionary keyed like the table's",
  "pq/data.parquet": "data.parquet · Parquet from the first row: each apply merges the new rows into the last row group while it is small, or starts a new one",
};

const clamp = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
// a table's commits in its sequencer's order, each with its txn and when it is applied
const ordered = (commits, late) => commits.map(([w, t, p]) => ({ w, t, p })).sort((a, b) => a.t - b.t).map((c, n) => ({ ...c, seq: n + 1, at: c.t + T.fly + T.apply, late: late && c.p !== "d4" }));
export const ORDERS = Object.fromEntries(Object.entries(RUNS).map(([sc, r]) => [sc, { trades: ordered(r.trades, sc === "late"), pq: ordered(r.pq, sc === "late") }]));
// when each table's partition for a day appears: when its first rows have been applied
export const BORN = Object.fromEntries(["trades", "pq"].map((t) => [t, Object.fromEntries(PARTS.map((p) => [p.id, Math.min(...ORDERS.policy[t].filter((c) => c.p === p.id).map((c) => c.at + T.fly))]))]));
export const dayOf = (s) => Math.max(0, Math.min(DAYS.length - 1, Math.floor((s - T0) / DAY)));

// Where a loop stands at second s: per table what is committed and applied, rows applied per
// day, and how far TO PARQUET has got (done before the late rows scenario begins).
export function stateAt(s, sc = "policy") {
  const of = (list) => {
    const committed = list.filter((c) => s >= c.t + T.fly), applied = list.filter((c) => s >= c.at + T.fly);
    const perDay = Object.fromEntries(PARTS.map((p) => [p.id, applied.filter((c) => c.p === p.id).length]));
    return { committed, applied, perDay, perWriter: [1, 2, 3].map((w) => committed.filter((c) => c.w === w).length) };
  };
  const o = ORDERS[sc];
  // the late rows scenario starts with every day written as in the policy loop
  const full = sc === "late" ? Object.fromEntries(PARTS.map((p) => [p.id, p.id === "d4" ? 3 : 2])) : null;
  const st = { s, sc, trades: of(o.trades), pq: of(o.pq), parquet: sc === "late" ? 1 : clamp((s - T.parquet) / T.stage) };
  if (full) for (const t of ["trades", "pq"]) for (const id in full) st[t].perDay[id] += full[id];
  return st;
}

// The readout: TO PARQUET while it runs, a late row's story while it lasts, otherwise
// whatever started last.
export function stepText(s, sc = "policy") {
  const o = ORDERS[sc];
  if (sc === "policy" && s >= T.parquet && s < T.parquet + T.stage) return "2026-11-19 00:05, the first policy check after midnight · TO PARQUET 3d · trades: 2026-11-15 ended three days ago, at 11-16 00:00, so it is rewritten as data.parquet and _pm in a new directory while rows keep landing in 2026-11-19 · trades_pq: nothing to convert";
  const now = [];
  for (const [table, list] of [["trades", o.trades], ["trades_pq", o.pq]]) for (const c of list) {
    const date = DATE_OF[c.p], first = sc === "policy" && Math.abs(c.at + T.fly - BORN[table === "trades" ? "trades" : "pq"][c.p]) < 1e-9;
    const day = sc === "late" ? "2026-11-19 10:00" : DATE_OF[`d${dayOf(c.t)}`];
    now.push([c.t, c.t + T.fly + (c.late ? 0.3 : 0), c.late ? 1 : 0, `${day} · ${table}: writer ${c.w} commits ${c.late ? `late rows for ${date}` : `rows for ${date}`} to wal${c.w}/0 · txn ${c.seq} in its _txnlog`]);
    const what = c.late
      ? table === "trades" && c.p === "d2" ? `${date} is native: into its column files` : `${date} is Parquet: merged into its data.parquet, the overlapping row group re-encoded`
      : first
        ? table === "trades" ? `the first rows of ${date}: its partition appears, native column files` : `the first rows of ${date}: its partition appears already Parquet, data.parquet and _pm`
        : table === "trades" ? `they append to ${date}'s native column files` : `they merge into ${date}'s data.parquet, the last row group while it is small; _pm gets a new snapshot`;
    now.push([c.at, c.at + T.fly + (c.late || first ? 0.9 : 0.4), c.late ? 2 : first ? 1 : 0, `${table}: apply txn ${c.seq} · ${what}`]);
  }
  // a late row's story outranks the day's own commits while it lasts
  const live = now.filter(([a, b]) => s >= a && s < b).sort((x, y) => y[2] - x[2] || y[0] - x[0]);
  if (live.length && live[0][2] === 2) return live.filter((x) => x[2] === 2).sort((x, y) => x[0] - y[0]).map((x) => x[3]).join(" · "); // both tables' late applies at once
  if (live.length) return live[0][3];
  if (sc === "late") return "late rows on 2026-11-19, among the day's own · each lands in whatever form its partition has, native or Parquet, never back to native · hover a file";
  if (s < T0 + 0.6) return "2026-11-15 00:00 · two empty tables with the same columns: trades, native by default, and trades_pq, FORMAT PARQUET · hover a file";
  if (s >= T.parquet) return "ingestion never stops: trades is native until three days past a partition's end, then Parquet · trades_pq is Parquet from the first row · hover a file";
  return `${DATE_OF[`d${dayOf(s)}`]} · both tables fill the day's partition; a new day starts a new one at midnight · hover a file`;
}
