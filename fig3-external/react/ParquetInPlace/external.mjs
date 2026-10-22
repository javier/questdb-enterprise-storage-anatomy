// The model behind Fig 5: the same SELECT as Fig 4, run by QuestDB or by an external
// engine that reads cold storage directly.
//
// From the cold storage docs (concepts/cold-storage.md, tutorials/questdb-to-iceberg.md):
//   - Everything TO REMOTE uploads is cold storage: one standard Parquet file per partition,
//     laid out Hive-style, <root>/trades~5/year=2026/month=10/day=20/data.parquet. Any
//     engine with access to the object store can read those files in place: DuckDB or
//     Databricks by reading the paths directly, Trino, Athena or BigQuery through external
//     or Iceberg tables registered over them (metadata only, no copy).
//   - Underscore objects (_pm, _manifest, _manager.lock, _tables) are QuestDB control data,
//     invisible to Hive readers. An external engine reads each file's own Parquet footer to
//     find the row groups and column chunks, where QuestDB uses its local _pm.
//   - Until DROP LOCAL seals a partition, a late write can still land in it: QuestDB then
//     invalidates the uploaded object and uploads a replacement, so an external reader may
//     briefly see a stale snapshot. A sealed partition never changes.
//   - The active partition and anything younger than TO REMOTE are not in cold storage yet,
//     so an external engine never sees them. QuestDB serves them from local disk.
//   - External engines may only read. QuestDB must be the only writer to the prefix.

import { storeState } from "./fig1/model.mjs";
import { C, GRAIN, columnRuns, groupsOf, spanOf } from "./fig2/query.mjs";

export const READERS = { questdb: "QUESTDB", external: "EXTERNAL ENGINES" };
export const READER_ORDER = ["questdb", "external"];
export const ENGINES = ["Databricks", "Trino", "Athena", "BigQuery", "DuckDB"];
export const ROOT = "s3://bucket/cold";

export const inColdStorage = (p, u) => storeState(GRAIN, p, u, C).lift >= 1;
export const sealedInStore = (p, u) => storeState(GRAIN, p, u, C).sealed;

// What an external engine reads for the query: every uploaded partition in range, sealed or
// not, and what it cannot see.
export function externalPlan(range, cols, partitions, u) {
  const plan = { parts: 0, sealed: 0, open: 0, chunks: 0, requests: 0, missing: 0 };
  for (const p of partitions) {
    const span = spanOf(p, range, u);
    if (!span) continue;
    if (!inColdStorage(p, u)) { plan.missing++; continue; }
    const groups = groupsOf(span);
    plan.parts++;
    if (sealedInStore(p, u)) plan.sealed++;
    else plan.open++;
    plan.chunks += groups * cols.length;
    plan.requests += groups * columnRuns(cols) + 1; // and the footer of each file
  }
  return plan;
}
const pluralOf = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
export function externalText(plan, engine) {
  if (!plan.parts && !plan.missing) return "no partitions in range";
  const out = [];
  if (!plan.parts) out.push(`${engine}: no file in cold storage for this range`);
  else out.push(`${engine}: each reads ${pluralOf(plan.parts, "file")} from cold storage (${plan.sealed} sealed, ${plan.open} not yet), ${pluralOf(plan.chunks, "chunk")} in ${pluralOf(plan.requests, "range read")}, footers included`);
  if (plan.missing) out.push(`cannot see ${pluralOf(plan.missing, "partition")} not yet uploaded`);
  return out.join(" · ");
}

// The same query in each engine's own SQL. DuckDB and Databricks read the Hive paths
// directly; Trino, Athena and BigQuery query a table registered over them.
const PATH = `${ROOT}/trades~5/`;
function whereOf(engine, range) {
  const [young, old] = range.ages;
  const ago = (n) => {
    const hours = n < 1;
    const v = hours ? Math.round(n * 24) : n;
    if (engine === "DuckDB") return `now() - INTERVAL ${v} ${hours ? "HOUR" : "DAY"}`;
    if (engine === "Databricks") return `current_timestamp() - INTERVAL ${v} ${hours ? "HOURS" : "DAYS"}`;
    if (engine === "BigQuery") return `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${v} ${hours ? "HOUR" : "DAY"})`;
    return `current_timestamp - INTERVAL '${v}' ${hours ? "HOUR" : "DAY"}`; // Trino, Athena
  };
  return young === 0 ? `ts >= ${ago(old)}` : `ts BETWEEN ${ago(old)} AND ${ago(young)}`;
}
export function engineSql(engine, range, cols) {
  const from = engine === "DuckDB" ? `read_parquet('${PATH}*/*/*/data.parquet', hive_partitioning = true)`
    : engine === "Databricks" ? `parquet.\`${PATH}\``
    : "analytics.trades";
  const note = from === "analytics.trades" ? ` · analytics.trades: an external or Iceberg table over ${PATH}` : "";
  return `${engine}: SELECT ${cols.join(", ")} FROM ${from} WHERE ${whereOf(engine, range)}${note}`;
}
export const engineHtml = (engine, range, cols) => engineSql(engine, range, cols).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'[^']*'|`[^`]*`/g, (s) => `<span style="white-space:nowrap">${s}</span>`);

// One partition, as an external engine sees it.
export function externalReadText(p, range, u, name, engine) {
  const span = spanOf(p, range, u);
  if (!span) return `${name} · outside the time range`;
  if (!inColdStorage(p, u)) return `${name} · not in cold storage yet · invisible to ${engine}, QuestDB serves it from local disk`;
  return `${name} · trades~5/year=…/day=…/data.parquet · ${sealedInStore(p, u) ? "sealed, never changes" : "not sealed: a late write would replace this object"}`;
}
