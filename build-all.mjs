// Rebuilds every figure, in both themes, then the series pages that show them in order.
//   node build-all.mjs
// Each figure's build writes its standalone pages, its still SVGs, its React component and
// the fragment the series page reads, so the series always comes last.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const BUILDS = [
  ["fig1-partitions/build.mjs"],
  ["fig2-queries/build.mjs"],
  ["fig3-external/build.mjs"],
  ["fig4-replication/build.mjs"],
  ["fig5-cluster-policy/build.mjs"],
  ["fig6-failover/build.mjs"],
  ["fig7-outage/build.mjs"],
  ["fig8-backups/build.mjs"],
  ["recover/build.mjs", "--fig", "replica"],
  ["recover/build.mjs", "--fig", "pitr"],
  ["series/build.mjs"],
];

for (const [script, ...args] of BUILDS) {
  for (const theme of [[], ["--light"]]) {
    execFileSync(process.execPath, [join(ROOT, script), ...args, ...theme], { stdio: "inherit" });
  }
}
