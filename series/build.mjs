// The series page: every figure, in order, on one page. Each figure's own build writes a
// fragment (its plate markup and its live script); this page loads the kit once and runs
// each figure's script in its own block, so their names never collide.
//   node fig1-partitions/build.mjs && node fig2-queries/build.mjs && node series/build.mjs
// (and the same with --light for the light page)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/Users/j/.claude/skills/anatomy/kit/iso-kit.mjs";
import { kitScript } from "/Users/j/.claude/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const KIT_DIR = "/Users/j/.claude/skills/anatomy/kit";
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (text) => text.replace(/^import .*$/gm, "").replace(/^export \{.*$/gm, "").replace(/^export /gm, "");
const latheScript = `const G = (() => {\n${strip(readFileSync(join(KIT_DIR, "lathe.mjs"), "utf8"))}\nreturn { frameAlong, disc };\n})();\n`;

const FIGURES = [
  { dir: "fig1-partitions", lead: "Partitions age through the storage policy. Each instance converts its own copy, one instance uploads for the whole cluster, and local data stays until DROP LOCAL." },
  { dir: "fig2-queries", lead: "A query reads what it can from the instance's own disk and the rest from the object store, and the mix shifts as data ages." },
  { dir: "fig3-replication", lead: "Two replicas join. Replication runs through the same object store: the primary uploads WAL segments, and each replica polls, downloads and applies them at its own pace." },
  { dir: "fig4-cluster-policy", lead: "The storage policy across the cluster: each instance converts its own copy, one instance uploads for everyone, and the DROP LOCAL seal travels through the WAL." },
  { dir: "fig5-failover", lead: "Changing the primary, planned or not. In a switchover the operator demotes the primary, promotes a replica, does the maintenance and switches back. In a failure the primary dies, a replica is promoted, and the client replays what was never acknowledged." },
];

const parts = FIGURES.map(({ dir, lead }) => {
  const { html, script } = JSON.parse(readFileSync(join(ROOT, dir, `fragment-${theme}.json`), "utf8"));
  return { html: `<p class="sa-lead">${lead}</p>${html}`, script: `{\n${script}\n}` };
});

const intro =
  `<style>.sa-series h1{font-size:22px;line-height:1.3;color:var(--anatomy-strong);margin:0 0 8px;font-weight:600}` +
  `.sa-series .sa-sub{margin:0 0 40px;color:var(--anatomy-text)}` +
  `.sa-lead{margin:64px 0 16px;color:var(--anatomy-text)}.sa-lead:first-of-type{margin-top:0}</style>` +
  `<header class="sa-series"><h1>Storage in QuestDB Enterprise</h1>` +
  `<p class="sa-sub">One table on a three-instance cluster, from the first row to the object store.</p></header>`;

const body = intro + parts.map((p) => p.html).join("");
const script = kitScript() + latheScript + parts.map((p) => p.script).join("\n");
const file = theme === "light" ? "index-light.html" : "index.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Storage in QuestDB Enterprise", theme, body, script, width: 780 }));
console.log("wrote series/" + file);
