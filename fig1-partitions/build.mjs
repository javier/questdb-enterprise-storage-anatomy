import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { kitScript } from "../kit/inline-kit.mjs";
import { GRAIN_ORDER, POLICY, PRESETS, SINGLE, clockOf, nextWorkText, policySql } from "./model.mjs";
import { PQ_CSS, makeParts } from "./parts.mjs";
import { itemsSvg, makeScene, ticksOf } from "./scene.mjs";
import { AZIMUTH, DARK, makeStage, projectionOf } from "./stage.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_DIR = fileURLToPath(new URL("../kit", import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (text) => text.replace(/^import .*$/gm, "").replace(/^export \{.*$/gm, "").replace(/^export /gm, "");

const WIDTH = 700;
const HEIGHT = 430;
const GRAIN = "DAY";
const U0 = PRESETS[GRAIN].start;

// Fig 2 is about one table on one instance: the primary alone, which is then its own
// cold storage manager. Fig 6 adds the replicas to the empty slots behind it.
const C = SINGLE;
POLICY.dropRemote = true; // Fig 2 alone draws DROP REMOTE, the end of a partition's life
const P = projectionOf(k, WIDTH, HEIGHT);
const parts = makeParts(k, G, P);
const render = makeScene(k, P, parts);
const { deck, benchBack, head, feed, staticLabels } = makeStage(k, G, P, parts);
const frame = render(GRAIN, U0, null, C);
const NAMES = [["PRIMARY", "takes the writes", "converts and uploads its partitions"]];
const lane = (i) => [
  benchBack(i),
  `<g data-part="marks-${i}">${parts.marksBack(i, GRAIN)}</g>`,
  `<g data-part="blocks-${i}">${itemsSvg(k, P, frame.lanes[i])}</g>`,
  `<g data-part="marksf-${i}">${parts.marksFront(i, GRAIN)}</g>`,
  head(i, { port: false }),
  `<g data-part="lamp-${i}">${frame.lamps[i]}</g>`,
];
const BODY = [
  deck({ bay: false, sign: "OBJECT STORE" }),
  `<g data-part="store">${itemsSvg(k, P, frame.store)}</g>`,
  `<g data-part="copy">${frame.copy}</g>`,
  ...lane(0),
  `<g data-part="dial">${parts.dialSvg(ticksOf(GRAIN, U0))}</g>`,
  `<path data-part="hand" class="iso-line" data-tone="lit" data-free="start" d="${frame.hand}" style="stroke-width:1"/>`,
  parts.hubSvg(),
  `<g data-part="ruler">${parts.rulerSvg(GRAIN)}</g>`,
  feed(),
  `<g data-part="rods">${frame.rods}</g>`,
  `<g data-part="feed">${frame.feed}</g>`,
  `<g data-part="late"></g>`,
  staticLabels(NAMES, { lanes: C.lanes, bay: false }),
  `<g data-part="labels">${parts.labelsSvg(GRAIN, { uploader: "uploaded by the primary, which keeps its local copy" })}</g>`,
];

const LABEL =
  "One QuestDB Enterprise instance, the primary, drawn as a bench with its own local disk, and an object store as a deck behind it. Rows from clients flow into the primary, and each partition is a pallet that moves along the bench as it ages, on a log scale. At the TO REMOTE mark the primary lifts a Parquet copy of the partition onto the deck while its local copy stays native. At TO PARQUET it converts its local copy to Parquet. At DROP LOCAL it drops the local data and keeps only the metadata, which reads from the Parquet partition on the deck. At DROP REMOTE the partition leaves the table, and its Parquet partition dims on the deck until it is reclaimed.";

const GRAIN_CSS =
  ".sa-f1 .iso-plate{padding-top:78px;padding-bottom:64px}" +
  '.sa-f1 .iso-plate-corner[data-corner="readout"]{left:0;right:auto;bottom:18px;white-space:normal}' +
  ".sa-grain{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:grid;justify-items:center;gap:7px;font:10.5px/1 var(--anatomy-mono);letter-spacing:.06em;color:var(--anatomy-muted);white-space:nowrap}" +
  ".sa-grain-row{display:flex;align-items:center;gap:6px}" +
  ".sa-grain button{font:inherit;letter-spacing:inherit;color:var(--anatomy-text);background:transparent;border:0;box-shadow:0 0 0 1px var(--anatomy-lo);padding:5px 8px;cursor:pointer;border-radius:0}" +
  '.sa-grain button[aria-checked="true"]{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-strong)}' +
  ".sa-grain button:focus-visible{outline:1px solid var(--anatomy-strong);outline-offset:2px}" +
  ".sa-sql{color:var(--anatomy-text);font-size:10px;white-space:normal;text-align:center;max-width:620px;line-height:1.4}" +
  ".sa-keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px 22px}" +
  ".sa-key{align-items:center;gap:10px}.sa-key svg.sa-swatch{width:52px;height:30px;flex:none;margin:0}" +
  "@media (max-width:560px){.sa-grain{top:34px}.sa-f1 .iso-plate{padding-top:110px;padding-bottom:96px}.sa-f1 .iso-plate-corner[data-corner=\"hint\"]{bottom:0;white-space:normal}.sa-f1 .iso-plate-corner[data-corner=\"readout\"]{bottom:30px}.sa-sql{max-width:300px}}";
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
writeFileSync(join(HERE, `partition-forms-${theme}.svg`), stillSvg(theme));

const DATA = { P, grain: GRAIN, cluster: "single", dropRemote: true, lateWrites: true, uploader: "uploaded by the primary, which keeps its local copy" };
const HERE_SRC = (file) => strip(readFileSync(join(HERE, file), "utf8"));
const latheScript = () => `const G = (() => {\n${strip(readFileSync(join(KIT_DIR, "lathe.mjs"), "utf8"))}\nreturn { frameAlong, disc };\n})();\n`;
const live = [
  HERE_SRC("model.mjs"),
  HERE_SRC("parts.mjs"),
  HERE_SRC("scene.mjs"),
  HERE_SRC("late.mjs"),
  HERE_SRC("live.mjs"),
  `const KIT = { ${Object.keys(k).join(", ")} };`,
  `mount(document.querySelector(".sa-f1 .iso-stage"), ${JSON.stringify(DATA)}, KIT, G);`,
].join("\n");

const grainSwitch =
  `<div class="sa-grain"><div class="sa-grain-row" role="radiogroup" aria-label="PARTITION BY">PARTITION BY` +
  GRAIN_ORDER.map((g) => `<button type="button" role="radio" data-grain="${g}" aria-checked="${g === GRAIN}">${g}</button>`).join("") +
  `</div><div class="sa-sql" data-sql>${policySql(GRAIN)}</div></div>`;

// The legend draws each key with the figure's own parts, colours and camera, so a key
// looks exactly like the thing it names.
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
  ["Parquet partition in the object store, uploaded at TO REMOTE", k.boxCorners({ x: 0, y: -13, w: 18, d: 26 }, 0, 7), (sp) => sp.copySvg(18, 0, false)],
  ["Rod: a dropped partition reading its data from the object store",k.boxCorners({ x: -4, y: -4, w: 8, d: 8 }, 0, 16), (sp, SP) => k.lineSvg(k.segment([0, 0, 1], [0, 0, 15], SP), { tone: "mid" }) + k.dotsSvg([k.iso([0, 0, 1], SP), k.iso([0, 0, 15], SP)], { size: 1, tone: "hi" })],
];
const keysHtml = `<span class="iso-keys sa-keys">${KEYS.map(([label, box, draw]) => `<span class="iso-key sa-key">${swatch(label, box, draw)}<span>${label}</span></span>`).join("")}</span>`;

const body =
  PAGE_CSS +
  `<div class="sa-plate sa-f1">` +
  k.plateHtml({
    fig: "Fig 2",
    title: "Storage policy",
    hint: "Hover a partition · space pauses · → next stage",
    readout: clockOf(GRAIN, U0) + " · " + nextWorkText(GRAIN, U0),
    keys: [],
    caption: `The table carries ${policySql(GRAIN)}. The stages are independent, and each falls due when a partition's end is older than its TTL; the instance checks every 5 minutes. At TO REMOTE it uploads the partition to the object store as Parquet, while it keeps serving its local copy, still native. At TO PARQUET it converts that local copy. Nothing leaves local disk until DROP LOCAL: the partition is sealed read-only, and the instance drops its local data and keeps only _pm and the symbol index, reading the data from the object store. At DROP REMOTE the partition leaves the table altogether, and cold storage reclaims its objects once the grace period, 30 minutes by default, has passed; it is the only stage that deletes data with no copy left anywhere. The table metadata in the head always stays local. The age axis is logarithmic, so recent partitions are wide and old ones close up. Fig 6 adds replicas to this picture.`,
    body: `${grainSwitch}<div class="iso-stage" tabindex="0" role="group" aria-label="Storage policy on one instance: hover a partition to read its state, Space pauses time, the right arrow skips to the next stage">${svg}</div>`,
  }).replace('<figcaption class="iso-legend">', '<figcaption class="iso-legend">' + keysHtml) +
  `</div>`;

const file = theme === "light" ? "partition-forms-light.html" : "partition-forms.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Storage policy", theme, body, script: kitScript() + latheScript() + live, width: 780 }));
// the plate and its script, for the series page that shows every figure in order
writeFileSync(join(HERE, `fragment-${theme}.json`), JSON.stringify({ html: body, script: live }));
console.log("wrote", file);

const REACT = join(HERE, "react", "PartitionForms");
mkdirSync(join(REACT, "kit"), { recursive: true });
for (const name of ["iso-kit.mjs", "lathe.mjs", "iso.css"]) copyFileSync(join(KIT_DIR, name), join(REACT, "kit", name));
for (const name of ["model.mjs", "parts.mjs", "scene.mjs", "late.mjs", "live.mjs"]) copyFileSync(join(HERE, name), join(REACT, name));
writeFileSync(join(REACT, "plate.generated.mjs"), `// Generated by fig1-partitions/build.mjs. Do not edit.\nexport const PLATE_HTML = ${JSON.stringify(body)};\nexport const DATA = ${JSON.stringify(DATA)};\n`);
console.log("wrote react/PartitionForms");
