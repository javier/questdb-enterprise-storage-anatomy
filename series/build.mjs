// The series page: every figure, in order, on one page. Each figure's own build writes a
// fragment (its plate markup and its live script); this page loads the kit once and runs
// each figure's script in its own block, so their names never collide.
//   node fig1-partitions/build.mjs && node fig2-queries/build.mjs && node series/build.mjs
// (and the same with --light for the light page)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import { kitScript } from "../kit/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const KIT_DIR = fileURLToPath(new URL("../kit", import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (text) => text.replace(/^import .*$/gm, "").replace(/^export \{.*$/gm, "").replace(/^export /gm, "");
const latheScript = `const G = (() => {\n${strip(readFileSync(join(KIT_DIR, "lathe.mjs"), "utf8"))}\nreturn { frameAlong, disc };\n})();\n`;

const FIGURES = [
  { dir: "fig0-files", lead: "Where rows go on one instance's own disk, before any object store. Two tables take the same rows in parallel: trades, native by default, which TO PARQUET converts as its partitions age, and trades_pq, created FORMAT PARQUET, which is Parquet from its first row." },
  { dir: "fig1-partitions", lead: "Partitions age through the storage policy. Each instance converts its own copy, one instance uploads for the whole cluster, and local data stays until DROP LOCAL." },
  { dir: "figA-internals", lead: "The same files under the storage policy, with the object store beside them: what TO REMOTE uploads, what TO PARQUET rewrites, what DROP LOCAL keeps, and where late rows go before and after the seal." },
  { dir: "fig2-queries", lead: "A query reads what it can from the instance's own disk and the rest from the object store, and the mix shifts as data ages." },
  { dir: "fig3-external", lead: "Cold storage is plain Parquet on Hive-style paths, so other engines can query it in place. They see everything TO REMOTE uploaded, and nothing newer." },
  { dir: "fig4-replication", lead: "Two replicas join. Replication runs through the same object store: the primary uploads WAL segments, and each replica polls, downloads and applies them at its own pace." },
  { dir: "fig5-cluster-policy", lead: "The storage policy across the cluster: each instance converts its own copy, one instance uploads for everyone, and the DROP LOCAL seal travels through the WAL." },
  { dir: "fig6-failover", lead: "Changing the primary, planned or not. In a switchover the operator demotes the primary, promotes a replica, does the maintenance and switches back. In a failure the primary dies, a replica is promoted, and the client replays what was never acknowledged." },
  { dir: "fig7-outage", lead: "When the object store is unreachable, nothing stops: each part retries on its own and nothing local depends on the store. What piles up, what waits, what fails, and how it all catches up." },
  { dir: "fig8-backups", lead: "Backups are incremental by partition: each night uploads only what changed and points at older backups for the rest. Keeping the latest five also sets how much WAL the object store keeps, and so how far back point-in-time recovery reaches." },
  { dir: "fig9-replica", lead: "Adding a replica without copying everything from the primary. A new instance restores a kept backup, replays the WAL since, and joins the cluster as replica 2." },
  { dir: "fig10-pitr", lead: "Recovering to a moment, without touching the cluster. A new instance restores a kept backup, replays WAL up to the target, and leaves with a fresh DataID: as the primary of a new cluster, or standalone." },
];

const parts = FIGURES.map(({ dir, lead }) => {
  const { html, script } = JSON.parse(readFileSync(join(ROOT, dir, `fragment-${theme}.json`), "utf8"));
  return { html: `<p class="sa-lead">${lead}</p>${html}`, script: `{\n${script}\n}` };
});

const intro =
  `<style>.sa-series h1{font-size:22px;line-height:1.3;color:var(--anatomy-strong);margin:0 0 8px;font-weight:600}` +
  `.sa-series .sa-sub{margin:0 0 40px;color:var(--anatomy-text)}` +
  `.sa-lead{margin:64px 0 16px;color:var(--anatomy-text)}.sa-lead:first-of-type{margin-top:0}` +
  // the pause, restart and speed buttons every figure gets, in a row just above its card
  `.sa-ctl{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:6px;margin:0 0 8px}` +
  `.sa-ctl>button{font:10.5px/1 var(--anatomy-mono);letter-spacing:.06em;color:var(--anatomy-text);background:var(--anatomy-card);border:0;box-shadow:0 0 0 1px var(--anatomy-lo);padding:5px 8px;cursor:pointer;border-radius:0}` +
  `.sa-ctl>button[aria-pressed="true"]{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-strong)}.sa-ctl>button:focus-visible{outline:1px solid var(--anatomy-strong);outline-offset:2px}` +
  `@media (prefers-reduced-motion: reduce){.sa-ctl{display:none}}</style>` +
  `<header class="sa-series"><h1>Storage in QuestDB Enterprise</h1>` +
  `<p class="sa-sub">From the first row on one instance's disk to a three-instance cluster on an object store.</p></header>`;

const body = intro + parts.map((p) => p.html).join("");
// A PAUSE / RESUME button above every figure. It presses the figure's own Space key, so each
// figure keeps its pause logic; it follows a Space pressed on the figure too, and after a
// click on the figure's other controls it re-reads the readout, since some of them resume.
// RESTART beside it runs the figure again from its first moment, through its restart().
// SPEED steps every figure through full, half and quarter speed at once: each figure scales
// its clock by its stage's data-speed. The choice is kept for the next visit when it can be.
const pauseScript = `
const SA_SPEEDS = [[1, "1×"], [0.5, "½×"], [0.25, "¼×"]];
let saSpeed = 0;
try { saSpeed = Math.max(0, SA_SPEEDS.findIndex(([v]) => String(v) === localStorage.getItem("sa-speed"))); } catch {}
const saSpeedButtons = [];
const saSetSpeed = (i) => {
  saSpeed = i;
  for (const st of document.querySelectorAll(".iso-plate .iso-stage")) st.dataset.speed = String(SA_SPEEDS[i][0]);
  for (const x of saSpeedButtons) { x.textContent = "SPEED " + SA_SPEEDS[i][1]; x.setAttribute("aria-pressed", String(i > 0)); }
  try { localStorage.setItem("sa-speed", String(SA_SPEEDS[i][0])); } catch {}
};
for (const plate of document.querySelectorAll(".iso-plate")) {
  const stage = plate.querySelector(".iso-stage");
  if (!stage) continue;
  const readout = plate.querySelector("[data-readout]");
  const bar = document.createElement("div");
  bar.className = "sa-ctl";
  const b = document.createElement("button");
  b.type = "button";
  b.className = "sa-pause";
  const again = document.createElement("button");
  again.type = "button";
  again.className = "sa-restart";
  again.textContent = "RESTART";
  again.addEventListener("click", () => { stage.restart?.(); paused = false; show(); });
  let paused = false;
  const show = () => { b.textContent = paused ? "RESUME" : "PAUSE"; b.setAttribute("aria-pressed", String(paused)); };
  b.addEventListener("click", () => {
    stage.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    paused = !paused;
    show();
  });
  stage.addEventListener("keydown", (e) => { if (e.key === " " && e.isTrusted) { paused = !paused; show(); } });
  plate.addEventListener("click", (e) => {
    if (e.target === b || e.target === again || e.target === slow || !e.target.closest?.("button")) return;
    setTimeout(() => { paused = /\\bpaused\\b/.test(readout?.textContent ?? ""); show(); }, 60);
  });
  const slow = document.createElement("button");
  slow.type = "button";
  slow.className = "sa-speed";
  slow.title = "Full, half or quarter speed, for every figure";
  slow.addEventListener("click", () => saSetSpeed((saSpeed + 1) % SA_SPEEDS.length));
  saSpeedButtons.push(slow);
  show();
  bar.append(b, again, slow);
  plate.before(bar);
}
saSetSpeed(saSpeed);
`;
const script = kitScript() + latheScript + parts.map((p) => p.script).join("\n") + pauseScript;
const file = theme === "light" ? "index-light.html" : "index.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Storage in QuestDB Enterprise", theme, body, script, width: 780 }));
console.log("wrote series/" + file);
