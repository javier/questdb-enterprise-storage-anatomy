// The model behind Fig 3: one Enterprise table, trades(ts, symbol INDEX, price, amount,
// venue VARCHAR), PARTITION BY DAY with STORAGE POLICY(TO REMOTE 1 HOUR, TO PARQUET 3 DAYS,
// DROP LOCAL 1 MONTH), seen around midnight on 2026-11-20: three writers filling 2026-11-19
// in parallel, and one partition of each age below it, each taking its own next step.
//
// From the code (questdb/core cairo and cairo/wal; questdb-ent storage policy and cold
// storage), checked 2026-10-22:
//   - Each writer appends to a WAL of its own, wal<N>, in segments: <N>/0 holds a .d per
//     column (.i for var-size) and _event, one record per transaction with its row range.
//     Writers never wait for each other.
//   - txn_seq is why that works: _txnlog gives every writer's commit one place in a single
//     order, as (WAL, segment, segment txn, commit time), 60 bytes a txn, in parts of 5,000.
//   - Apply walks _txnlog in that order and copies each transaction's rows from its own WAL
//     into the partition's column files, then commits _txn with the seq_txn applied.
//   - A stage falls due once the partition's end is older than its TTL, at the next 5-minute
//     storage policy check. So just after 2026-11-20 00:00, 2026-11-16 (ended 11-17 00:00) is
//     three days past its end and 2026-10-19 (ended 10-20 00:00) a month past it; at 01:00
//     2026-11-19 is an hour past its end.
//   - TO REMOTE: the cold storage manager uploads a Parquet snapshot of the partition, native
//     here, to <root>/trades~5/year=2026/month=11/day=19/data.parquet, with _pm.a next to it;
//     the table's _manifest there records it. The local partition stays as it was.
//   - TO PARQUET: each instance rewrites its own copy as data.parquet and _pm, QuestDB's
//     sidecar with every chunk's byte range, codec and min/max, in a new directory
//     2026-11-16.<txn>; the symbol index is hard-linked across, the native files go. Cold
//     storage is not touched: it already has the partition.
//   - Until DROP LOCAL seals it, a partition takes late rows whether native or Parquet: they
//     land in the local copy, and if it is already uploaded the manager replaces the cold copy.
//   - A late row is applied like any other, from its writer's WAL in the sequencer's order,
//     into the partition it belongs to: into the native column files, or straight into the
//     local data.parquet of a Parquet partition. If the partition is in cold storage, the
//     uploaded copy is invalidated and the manager uploads a replacement.
//   - DROP LOCAL: the partition is sealed read-only and its local data.parquet removed; _pm
//     and the symbol index stay local, and reads fetch byte ranges from cold storage. A late
//     row for a sealed partition is skipped at apply time.

export const ROW_GROUPS = 4;
export const SLOT = 32; // a partition's file slot along x
export const WAL_SLOT = 9; // a WAL segment's cards are narrower
export const WRITERS = 3;

// Ingestion never stops: the transactions, as committed all through the loop into the active
// day, 2026-11-20, while the storage policy works on older partitions: [writer, commit
// second]. The sequencer numbers them in commit order, whichever writer they come from.
export const COMMITS = [[1, 0.6], [2, 2.4], [3, 4.2], [1, 6.4], [3, 8.6], [2, 10.8]];
export const APPLY_LAG = 0.25; // apply follows each commit, in sequencer order
export const T = { fly: 0.6, parquet: 6.0, drop: 7.8, remote: 9.6, stage: 1.6, loop: 13.6 };

// The late rows scenario, on 2026-11-20 after the policy's pass: one late commit from each
// writer, each for a partition in a different state. Seconds from the start of its loop.
export const LATE = [
  { w: 1, t: 0.9, p: "p0", kind: "native", at: "10:00", date: "2026-11-19", why: "which ended at midnight" },
  { w: 2, t: 4.1, p: "p1", kind: "parquet", at: "10:05", date: "2026-11-16", why: "Parquet now, and not sealed" },
  { w: 3, t: 7.3, p: "p3", kind: "sealed", at: "10:10", date: "2026-10-18", why: "sealed by DROP LOCAL" },
];
export const LATE_T = { fly: 0.6, apply: 0.8, stale: 1.5, upload: 1.9, back: 2.7, loop: 12.2 };
// the day's own rows keep arriving among the late ones: [writer, commit second]
export const ON_TIME = [[3, 2.6], [1, 5.8], [2, 9.6]];
export const SCENARIOS = { policy: { label: "APPEND + TIERING", loop: T.loop }, late: { label: "LATE ROWS", loop: LATE_T.loop } };

// One partition of each age, newest first, and the forms each one takes on its shelf.
export const PARTS = [
  { id: "pa", date: "2026-11-20", forms: ["native"] },
  { id: "p0", date: "2026-11-19", forms: ["native"] },
  { id: "p1", date: "2026-11-16", forms: ["native", "pm", "data"], suffix: ".37" },
  { id: "p2", date: "2026-10-19", forms: ["pm", "data"], suffix: ".12" },
  { id: "p3", date: "2026-10-18", forms: ["pm"], suffix: ".11" },
];

export const COLUMNS = ["ts.d", "symbol.d", "price.d", "amount.d", "venue.d", "venue.i", "symbol.k", "symbol.v"];
export const WAL_FILES = ["_event", "_event.i", "ts.d", "symbol.d", "price.d", "amount.d", "venue.d", "venue.i"];


export const FILES = {
  wal: (n, f) => `wal${n}/0/${f} · ${f === "_event" ? "one record per transaction of this writer: segment txn, row range, min and max timestamp, new symbols" : f === "_event.i" ? "where each record starts in _event" : "this writer's rows for the column, appended as written; writers never wait for each other"}`,
  "seq/_txnlog": "_txnlog · every writer's commits in one order: per txn the WAL, segment, segment txn and commit time; 60 bytes a txn, parts of 5,000",
  "seq/_meta": "txn_seq/_meta · the schema as the sequencer sees it",
  "seq/_wal_index.d": "_wal_index.d · hands each new writer its WAL number",
  "seq/_txn_parts/": "_txn_parts/ · the txnlog in parts of 5,000 txns, the parts replication uploads",
  "table/_meta": "_meta · the schema: columns, types, partitioning, designated timestamp",
  "table/_txn": "_txn · the committed state: the seq_txn applied, row counts, and a 32-byte entry per partition (rows, Parquet, read-only and remote flags, the .N suffix, size)",
  "table/_cv": "_cv · column versions and tops",
  "table/symbol.o": "symbol.o · the symbol dictionary's offsets, once for the table",
  "table/symbol.c": "symbol.c · the symbol dictionary's strings",
  "table/symbol.k": "symbol.k (table) · string to key lookup",
  "table/symbol.v": "symbol.v (table) · the lookup's values",
  "partition/ts.d": "ts.d · the designated timestamp, 8 bytes a row, sorted",
  "partition/symbol.d": "symbol.d · int keys into the table's dictionary",
  "partition/symbol.k": "symbol.k · the index: per key, where its row ids start; kept through every stage",
  "partition/symbol.v": "symbol.v · the index's row ids, in blocks; kept through every stage",
  "partition/price.d": "price.d · a DOUBLE, 8 bytes a row",
  "partition/amount.d": "amount.d · a DOUBLE, 8 bytes a row",
  "partition/venue.d": "venue.d · VARCHAR bytes that do not fit inline",
  "partition/venue.i": "venue.i · 16 bytes a row: length, flags, prefix, offset into venue.d",
  "partition/_pm": "_pm · QuestDB's sidecar: every chunk's byte range, codec and min/max; stays local after DROP LOCAL, so a read knows which ranges to fetch",
  "partition/data.parquet": "data.parquet · row groups of 100,000 rows, a chunk per column, LZ4_RAW; removed locally at DROP LOCAL",
  "store/_manifest": "trades~5/_manifest in cold storage · the table's record of every partition it holds and its state",
  "store/data.parquet": "data.parquet in cold storage · the snapshot TO REMOTE uploaded, whatever the local copy was; after DROP LOCAL the only copy of the data, read by byte range",
  "store/_pm.a": "_pm.a · the snapshot's Parquet metadata, next to it in cold storage",
};

const clamp = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
// the sequencer's order: commit order
export const ORDER = COMMITS.map(([w, t], i) => ({ w, t, i })).sort((a, b) => a.t - b.t).map((c, n) => ({ ...c, seq: n + 1 }));
export const applyAt = (n) => ORDER[n].t + T.fly + APPLY_LAG; // when sequencer txn n+1 is applied
// the late rows scenario's commits, late and on time, in its sequencer's order (txns 7 on)
export const LATE_ORDER = [...LATE.map((l) => ({ ...l, late: true })), ...ON_TIME.map(([w, t]) => ({ w, t, p: "pa", late: false }))]
  .sort((a, b) => a.t - b.t).map((c, n) => ({ ...c, seq: ORDER.length + 1 + n, at: c.t + T.fly + APPLY_LAG }));

// Where a cycle stands at second s.
export function stateAt(s) {
  const committed = ORDER.filter((c) => s >= c.t + T.fly);
  const applied = ORDER.filter((c, n) => s >= applyAt(n) + T.fly).length;
  const perWriter = [1, 2, 3].map((w) => committed.filter((c) => c.w === w).length);
  return {
    s, committed: committed.length, applied, perWriter,
    remote: clamp((s - T.remote) / T.stage), parquet: clamp((s - T.parquet) / T.stage), drop: clamp((s - T.drop) / T.stage),
  };
}

// The readout: a stage of the policy while it runs, otherwise whatever started last.
export function stepText(s) {
  const st = stateAt(s);
  if (s >= T.parquet && s < T.parquet + T.stage) return "2026-11-20 00:05, the first check after midnight · TO PARQUET 3d · 2026-11-16 ended three days ago, at 11-17 00:00: the local copy is rewritten as data.parquet and _pm in 2026-11-16.37/; cold storage already has it; rows keep landing in 2026-11-20";
  if (s >= T.drop && s < T.drop + T.stage) return "2026-11-20 00:05 · DROP LOCAL 1M · 2026-10-19 ended a month ago, at 10-20 00:00: sealed, so late rows for it are skipped from now on; the local data.parquet goes, _pm and the index stay, and reads go to cold storage";
  if (s >= T.remote && s < T.remote + T.stage) return "2026-11-20 01:00 · TO REMOTE 1h · 2026-11-19 ended an hour ago: a Parquet snapshot goes up to cold storage; the local copy stays native; rows keep landing in 2026-11-20";
  const now = [];
  ORDER.forEach((c, n) => {
    now.push([c.t, c.t + T.fly, `2026-11-20 · writer ${c.w} commits to wal${c.w}/0 while the others keep writing · the sequencer makes it txn ${c.seq} in _txnlog`]);
    now.push([applyAt(n), applyAt(n) + T.fly, `apply txn ${n + 1}, from wal${c.w} · its rows go into the active day's column files, 2026-11-20.36/, in the sequencer's order; _txn says seq_txn ${n + 1}`]);
  });
  const live = now.filter(([a, b]) => s >= a && s < b).sort((x, y) => y[0] - x[0]);
  if (live.length) return live[0][2];
  if (st.remote >= 1) return "ingestion never stops · newest at the top: the active day, native, then Parquet, both local and cold, then cold only · until the seal a late row still lands locally and its cold copy is replaced · hover a file";
  return "three writers ingest into 2026-11-20 in parallel, each into its own WAL, while the storage policy works on older days · hover a file";
}

// The late rows scenario's readout at second s of its loop.
export function lateText(s) {
  for (let i = 0; i < LATE.length; i++) {
    const l = LATE[i], txn = LATE_ORDER.find((c) => c.late && c.p === l.p).seq;
    if (s >= l.t && s < l.t + LATE_T.fly) return `2026-11-20 ${l.at} · writer ${l.w} commits rows for ${l.date}, ${l.why} · the sequencer makes it txn ${txn} in _txnlog`;
    const a = l.t + LATE_T.apply;
    if (s >= a && s < a + LATE_T.fly + 0.3) {
      if (l.kind === "native") return `apply txn ${txn}, from wal${l.w} · ${l.date} is not sealed: its rows land in the native column files`;
      if (l.kind === "parquet") return `apply txn ${txn}, from wal${l.w} · ${l.date} is not sealed: its rows go from the WAL straight into the local data.parquet`;
      return `apply txn ${txn}, from wal${l.w} · ${l.date} is sealed: the row is skipped at apply time, not rejected at insert time`;
    }
    if (s >= a + LATE_T.fly + 0.3 && s < l.t + LATE_T.back + 0.4) {
      if (l.kind === "sealed") return `${l.date} is unchanged: its _pm and index here, its data in cold storage · a sealed partition takes no more writes`;
      return `the cold copy of ${l.date} is out of date: the manager uploads a replacement, so cold storage never drifts from the table`;
    }
  }
  for (const c of LATE_ORDER) if (!c.late) {
    if (s >= c.t && s < c.t + T.fly) return `2026-11-20 · writer ${c.w} commits rows for today, 2026-11-20, among the late ones · txn ${c.seq} in _txnlog`;
    if (s >= c.at && s < c.at + T.fly) return `apply txn ${c.seq}, from wal${c.w} · on-time rows, into the active day's column files`;
  }
  return "late rows on 2026-11-20, among the day's own · native and Parquet partitions take them until DROP LOCAL seals them · hover a file";
}
