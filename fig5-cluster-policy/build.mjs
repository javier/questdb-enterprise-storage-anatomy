// Fig 5: the storage policy from Fig 1 running across the cluster from Fig 4. Built from
// Fig 1's modules with the full cluster (CLUSTER): each instance converts its own copy,
// only replica 2, the cold storage manager, uploads, and the DROP LOCAL seal travels
// through the WAL. This is the three-instance figure from before the series was split.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { kitScript } from "../kit/inline-kit.mjs";
import { CLUSTER, GRAIN_ORDER, MANAGER_MODES, MANAGER_ORDER, PRESETS, clockOf, nextWorkText, policySql } from "../fig1-partitions/model.mjs";
import { PQ_CSS, makeParts } from "../fig1-partitions/parts.mjs";
import { itemsSvg, makeScene, ticksOf } from "../fig1-partitions/scene.mjs";
import { AZIMUTH, DARK, makeStage, projectionOf } from "../fig1-partitions/stage.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIG1 = join(HERE, "..", "fig1-partitions");
const KIT_DIR = fileURLToPath(new URL("../kit", import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (text) => text.replace(/^import .*$/gm, "").replace(/^export \{.*$/gm, "").replace(/^export /gm, "");

const WIDTH = 700;
const HEIGHT = 430;
const GRAIN = "DAY";
const U0 = PRESETS[GRAIN].start;
const C = CLUSTER;

const P = projectionOf(k, WIDTH, HEIGHT);
const parts = makeParts(k, G, P);
const render = makeScene(k, P, parts);
const { deck, benchBack, head, feed, staticLabels } = makeStage(k, G, P, parts);
const frame = render(GRAIN, U0, null, C);
// who holds the cold storage manager role is drawn live, beside that instance
const NAMES = [["PRIMARY", "writes the WAL"], ["REPLICA 1", "reads the WAL"], ["REPLICA 2", "reads the WAL"]];
const lane = (i) => [
  `<g data-part="lane-${i}">`,
  benchBack(i),
  `<g data-part="marks-${i}">${parts.marksBack(i, GRAIN)}</g>`,
  `<g data-part="blocks-${i}">${itemsSvg(k, P, frame.lanes[i])}</g>`,
  `<g data-part="marksf-${i}">${parts.marksFront(i, GRAIN)}</g>`,
  head(i),
  `<g data-part="lamp-${i}">${frame.lamps[i]}</g>`,
  `</g>`,
];
const BODY = [
  deck(),
  `<g data-part="store">${itemsSvg(k, P, frame.store)}</g>`,
  `<g data-part="wal">${frame.wal}</g>`,
  ...lane(2),
  `<g data-part="copy">${frame.copy}</g>`,
  ...lane(1),
  ...lane(0),
  `<g data-part="dial">${parts.dialSvg(ticksOf(GRAIN, U0))}</g>`,
  `<path data-part="hand" class="iso-line" data-tone="lit" data-free="start" d="${frame.hand}" style="stroke-width:1"/>`,
  parts.hubSvg(),
  `<g data-part="ruler">${parts.rulerSvg(GRAIN)}</g>`,
  feed(),
  `<g data-part="rods">${frame.rods}</g>`,
  `<g data-part="feed">${frame.feed}</g>`,
  `<g data-part="flying">${frame.flying}</g>`,
  staticLabels(NAMES),
  `<g data-part="labels">${parts.labelsSvg(GRAIN, { uploader: "uploaded once, by the cold storage manager" })}</g>`,
  `<g data-part="mgr"></g>`,
];

const LABEL =
  "Three QuestDB Enterprise instances, a primary and two replicas, drawn as benches side by side, each with its own local disk, and one object store as a deck behind them all. Each partition is a pallet that moves along its bench as it ages, on a log scale. At the TO REMOTE mark only replica 2, the cold storage manager, lifts the partition, as Parquet, onto the deck while every bench keeps its local copy, still native. At TO PARQUET each instance converts its own copy. At DROP LOCAL each instance drops its local data and keeps only its metadata, which reads from the one Parquet partition on the deck. On the same deck, small WAL segments flow continuously from the primary to the replicas.";

const GRAIN_CSS =
  ".sa-f4 .iso-plate{padding-top:112px;padding-bottom:64px}" +
  '.sa-f4 .iso-plate-corner[data-corner="readout"]{left:0;right:auto;bottom:18px;white-space:normal}' +
  ".sa-grain{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:grid;justify-items:center;gap:7px;font:10.5px/1 var(--anatomy-mono);letter-spacing:.06em;color:var(--anatomy-muted);white-space:nowrap}" +
  ".sa-grain-row{display:flex;align-items:center;gap:6px}" +
  ".sa-grain button{font:inherit;letter-spacing:inherit;color:var(--anatomy-text);background:transparent;border:0;box-shadow:0 0 0 1px var(--anatomy-lo);padding:5px 8px;cursor:pointer;border-radius:0}" +
  '.sa-grain button[aria-checked="true"]{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-strong)}' +
  ".sa-grain button:focus-visible{outline:1px solid var(--anatomy-strong);outline-offset:2px}" +
  ".sa-sql{color:var(--anatomy-text);font-size:10px;white-space:normal;text-align:center;max-width:620px;line-height:1.4}" +
  ".sa-keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px 22px}" +
  ".sa-key{align-items:center;gap:10px}.sa-key svg.sa-swatch{width:52px;height:30px;flex:none;margin:0}" +
  "@media (max-width:560px){.sa-grain{top:34px}.sa-f4 .iso-plate{padding-top:150px;padding-bottom:96px}.sa-f4 .iso-plate-corner[data-corner=\"hint\"]{bottom:0;white-space:normal}.sa-f4 .iso-plate-corner[data-corner=\"readout\"]{bottom:30px}.sa-sql{max-width:300px}}";
const PAGE_CSS = `<style>.iso:not([data-theme="light"]) svg.sa-fig{${DARK}}${GRAIN_CSS}${PQ_CSS}</style>`;
const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: BODY, className: "sa-fig" });

const stillSvg = (mode) =>
  k.figureSvg({
    width: WIDTH,
    height: HEIGHT,
    label: LABEL,
    className: "sa-fig",
    standalone: mode,
    body: [`<style>${mode === "dark" ? `svg.sa-fig{${DARK}}` : ""}${PQ_CSS}</style>`, `<rect width="${WIDTH}" height="${HEIGHT}" style="fill:var(--anatomy-paper)"/>`, ...BODY],
  });
writeFileSync(join(HERE, `cluster-policy-${theme}.svg`), stillSvg(theme));

const DATA = { P, grain: GRAIN, cluster: "cluster", uploader: "uploaded once, by the cold storage manager" };
const SRC = (file) => strip(readFileSync(join(FIG1, file), "utf8"));
const latheScript = () => `const G = (() => {\n${strip(readFileSync(join(KIT_DIR, "lathe.mjs"), "utf8"))}\nreturn { frameAlong, disc };\n})();\n`;
const live = [
  SRC("model.mjs"),
  SRC("parts.mjs"),
  SRC("scene.mjs"),
  SRC("late.mjs"),
  SRC("live.mjs"),
  `const KIT = { ${Object.keys(k).join(", ")} };`,
  `mount(document.querySelector(".sa-f4 .iso-stage"), ${JSON.stringify(DATA)}, KIT, G);`,
].join("\n");

const grainSwitch =
  `<div class="sa-grain"><div class="sa-grain-row" role="radiogroup" aria-label="PARTITION BY">PARTITION BY` +
  GRAIN_ORDER.map((g) => `<button type="button" role="radio" data-grain="${g}" aria-checked="${g === GRAIN}">${g}</button>`).join("") +
  `</div><div class="sa-sql" data-sql>${policySql(GRAIN)}</div>` +
  `<div class="sa-grain-row" role="radiogroup" aria-label="cold storage manager">MANAGER` +
  MANAGER_ORDER.map((m) => `<button type="button" role="radio" data-manager="${m}" aria-checked="${m === "steady"}">${MANAGER_MODES[m].label}</button>`).join("") +
  `</div></div>`;

function swatch(label, box, draw) {
  const W = 52, H = 30;
  const SP = k.fitProjection(box, W, H, { pad: 2, azimuth: AZIMUTH });
  const sp = makeParts(k, G, SP);
  return k.figureSvg({ width: W, height: H, label, body: draw(sp, SP), className: "sa-fig sa-swatch" });
}
const pallet = k.boxCorners({ x: 0, y: -13, w: 18, d: 26 }, 0, 9);
const KEYS = [
  ["Native partition: one bar per column file, plus the symbol index at the back", pallet, (sp) => sp.blockSvg(18, { m: 0 })],
  ["Parquet partition: light blue data.parquet, with _pm, its metadata, in solid blue at the end", pallet, (sp) => sp.blockSvg(18, { m: 1 })],
  ["After DROP LOCAL: only _pm and the symbol index stay on the instance", pallet, (sp) => sp.blockSvg(18, { m: 1, sealed: 1, evict: 1 })],
  ["Parquet partition in the object store, uploaded once by the cold storage manager", k.boxCorners({ x: 0, y: -13, w: 18, d: 26 }, 0, 7), (sp) => sp.copySvg(18, 0, false)],
  ["WAL segment, streaming through the object store from the primary to the replicas", k.boxCorners({ x: -4, y: -4, w: 8, d: 8 }, 0, 3), (sp) => sp.chipSvg([0, 0, 0], false)],
  ["Rod: a dropped partition reading its data from the object store", k.boxCorners({ x: -4, y: -4, w: 8, d: 8 }, 0, 16), (sp, SP) => k.lineSvg(k.segment([0, 0, 1], [0, 0, 15], SP), { tone: "mid" }) + k.dotsSvg([k.iso([0, 0, 1], SP), k.iso([0, 0, 15], SP)], { size: 1, tone: "hi" })],
];
const keysHtml = `<span class="iso-keys sa-keys">${KEYS.map(([label, box, draw]) => `<span class="iso-key sa-key">${swatch(label, box, draw)}<span>${label}</span></span>`).join("")}</span>`;

const body =
  PAGE_CSS +
  `<div class="sa-plate sa-f4">` +
  k.plateHtml({
    fig: "Fig 5",
    title: "Storage policy across the cluster",
    hint: "Hover a partition · space pauses · → next stage",
    readout: clockOf(GRAIN, U0) + " · " + nextWorkText(GRAIN, U0),
    keys: [],
    caption: `The table from Fig 1, ${policySql(GRAIN)}, now on the cluster from Fig 4. The policy is replicated, and each instance checks it every 5 minutes on its own, so the three can briefly disagree. TO REMOTE runs only on the cold storage manager, here replica 2: it uploads each partition once, as Parquet, for the whole cluster, while every instance keeps serving its own local copy, still native. TO PARQUET converts each instance's own local copy. Nothing leaves local disk until DROP LOCAL: the primary writes a seal into the WAL, the manager marks the uploaded partition Sealed, and each instance then drops its local data and keeps only _pm and the symbol index, reading the data from the one Parquet partition on the deck. The cold storage manager role is separate from the primary and replica roles, and it can move: HANDOFF runs SWITCH COLD STORAGE ROLE TO REFRESHER on the manager, which flushes its manifests and releases _manager.lock in the object store, then TO MANAGER on the replacement; uploads and garbage collection pause in between while reads carry on, and server.conf should then be updated, since a restart boots into cold.storage.role. MANAGER DIES shows the other case: nothing takes over on its own, uploads stop, and partitions due for DROP LOCAL keep their local data, since it is never dropped without a durable remote copy. A restarted instance finds the foreign lock and stays a refresher, so an operator proves the old manager dead and runs TO MANAGER FORCE elsewhere; the backlog then uploads. The age axis is logarithmic, so recent partitions are wide and old ones close up.`,
    body: `${grainSwitch}<div class="iso-stage" tabindex="0" role="group" aria-label="Storage policy across a cluster: hover a partition to read its state, Space pauses time, the right arrow skips to the next stage">${svg}</div>`,
  }).replace('<figcaption class="iso-legend">', '<figcaption class="iso-legend">' + keysHtml) +
  `</div>`;

const file = theme === "light" ? "cluster-policy-light.html" : "cluster-policy.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Storage policy across the cluster", theme, body, script: kitScript() + latheScript() + live, width: 780 }));
writeFileSync(join(HERE, `fragment-${theme}.json`), JSON.stringify({ html: body, script: live }));
console.log("wrote", file);

const REACT = join(HERE, "react", "ClusterStoragePolicy");
mkdirSync(join(REACT, "kit"), { recursive: true });
for (const name of ["iso-kit.mjs", "lathe.mjs", "iso.css"]) copyFileSync(join(KIT_DIR, name), join(REACT, "kit", name));
for (const name of ["model.mjs", "parts.mjs", "scene.mjs", "late.mjs", "live.mjs"]) copyFileSync(join(FIG1, name), join(REACT, name));
writeFileSync(join(REACT, "plate.generated.mjs"), `// Generated by fig5-cluster-policy/build.mjs. Do not edit.\nexport const PLATE_HTML = ${JSON.stringify(body)};\nexport const DATA = ${JSON.stringify(DATA)};\n`);
console.log("wrote react/ClusterStoragePolicy");
