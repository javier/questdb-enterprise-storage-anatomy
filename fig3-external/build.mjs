import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/Users/j/.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "/Users/j/.claude/skills/anatomy/kit/lathe.mjs";
import { kitScript } from "/Users/j/.claude/skills/anatomy/scripts/inline-kit.mjs";
import { clockOf, partitionsAt, policySql } from "../fig1-partitions/model.mjs";
import { BENCH, DECK, DECK_TOP, FLOOR, FLY_Z, HEAD, LANE_Y, PQ_CSS, RULER, X_NOW, makeParts } from "../fig1-partitions/parts.mjs";
import { itemsSvg, makeScene, ticksOf } from "../fig1-partitions/scene.mjs";
import { AZIMUTH, DARK, benchPlan, makeStage } from "../fig1-partitions/stage.mjs";
import { COLUMNS, GRAIN, RANGES, planOf, planText, rangeOf, sqlHtml } from "../fig2-queries/query.mjs";
import { makeFigure } from "../fig2-queries/figure.mjs";
import { READERS, READER_ORDER } from "./external.mjs";
import { SHELF, makeExternal, terminalAt } from "./draw.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const FIG1 = join(ROOT, "fig1-partitions");
const FIG2 = join(ROOT, "fig2-queries");
const KIT_DIR = "/Users/j/.claude/skills/anatomy/kit";
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (text) => text.replace(/^import .*$/gm, "").replace(/^export \{.*$/gm, "").replace(/^export /gm, "");

const WIDTH = 700;
const HEIGHT = 430;
// Fig 2's camera, reaching back past the object store to the engines' shelf.
const P = k.fitProjection(
  [
    ...k.boxCorners(benchPlan(0), FLOOR, 0),
    ...k.boxCorners(DECK, FLOOR, DECK_TOP + 6),
    ...k.boxCorners(SHELF, FLOOR, SHELF.z + SHELF.t + 22),
    ...k.boxCorners(RULER, FLOOR, FLOOR + 1),
    [X_NOW, LANE_Y[0], FLY_Z + 3],
    [HEAD.x + HEAD.w + 26, LANE_Y[0] + 8, 4],
    [HEAD.x + HEAD.w + 70, LANE_Y[0] - BENCH.d, 6],
  ],
  WIDTH,
  HEIGHT,
  { pad: 14, azimuth: AZIMUTH },
);
const parts = makeParts(k, G, P);
const scene = makeScene(k, P, parts);
const render = makeExternal(k, P, parts, makeFigure(k, P, parts, scene), scene);
const { deck, benchBack, head, feed, staticLabels } = makeStage(k, G, P, parts);

const U0 = 60.75; // as in Fig 2
const R0 = "45d", COLS0 = ["ts", "symbol", "price"];
const frame = render("questdb", R0, COLS0, U0, null, 0);
const TIER_MARKS = [1, 2];

const BODY = [
  render.shelfSvg(),
  `<g data-part="terminals">${frame.terminals}</g>`,
  deck({ bay: false, sign: "OBJECT STORE · COLD STORAGE" }),
  render.bandsSvg(),
  `<g data-part="store">${itemsSvg(k, P, frame.store)}</g>`,
  `<g data-part="copy">${frame.copy}</g>`,
  benchBack(0),
  parts.marksBack(0, GRAIN, TIER_MARKS),
  `<g data-part="blocks-0">${itemsSvg(k, P, frame.lanes[0])}</g>`,
  parts.marksFront(0, GRAIN, TIER_MARKS),
  head(0, { port: false }),
  `<g data-part="lamp-0">${frame.lamps[0]}</g>`,
  `<g data-part="caliper">${frame.caliper}</g>`,
  parts.dialSvg(ticksOf(GRAIN, U0)),
  `<path data-part="hand" class="iso-line" data-tone="lit" data-free="start" d="${frame.hand}" style="stroke-width:1"/>`,
  parts.hubSvg(),
  feed(),
  parts.rulerSvg(GRAIN, TIER_MARKS),
  `<g data-part="rods">${frame.rods}</g>`,
  `<g data-part="feed">${frame.feed}</g>`,
  staticLabels([["QUESTDB", "reads every tier"]], { extras: false, lanes: [0], bay: false }),
  `<g data-part="terminal-labels">${frame.terminalLabels}</g>`,
  parts.label([terminalAt(0).x, terminalAt(0).y, SHELF.z + SHELF.t + 11], "EXTERNAL ENGINES", { anchor: "start", dy: -24 }),
  render.bandLabels(),
  parts.tiersSvg(GRAIN),
];

const LABEL =
  "Fig 2's instance and query, with external engines on a shelf on the far side of the object store: Databricks, Trino, Athena, BigQuery and DuckDB. Everything TO REMOTE uploaded is in cold storage as standard Parquet, one file per partition on Hive-style paths, so these engines can run the same query over those files in place, all at once. Pick the reader: QuestDB lights what it reads on its own bench and in cold storage, as in Fig 2; the external engines light only partitions in cold storage, on the deck, and their range reads run back off the deck to every terminal in parallel. A band along the deck front marks the sealed partitions, which never change, the uploaded ones not yet sealed, which a late write can replace, and the newest stretch, not uploaded yet, which only QuestDB can see.";

const CONTROL_CSS =
  ".sa-f3x .iso-plate{padding-top:206px;padding-bottom:64px}" +
  ".sa-sql.sa-policy{color:var(--anatomy-muted)}" +
  '.sa-f3x .iso-plate-corner[data-corner="readout"]{left:0;right:auto;bottom:18px;white-space:normal}' +
  ".sa-grain{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:grid;justify-items:center;gap:7px;font:10.5px/1 var(--anatomy-mono);letter-spacing:.06em;color:var(--anatomy-muted);white-space:nowrap}" +
  ".sa-grain-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}" +
  ".sa-grain button{font:inherit;letter-spacing:inherit;color:var(--anatomy-text);background:transparent;border:0;box-shadow:0 0 0 1px var(--anatomy-lo);padding:5px 8px;cursor:pointer;border-radius:0}" +
  '.sa-grain button[aria-checked="true"],.sa-grain button[aria-pressed="true"]{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-strong)}' +
  ".sa-grain button:focus-visible{outline:1px solid var(--anatomy-strong);outline-offset:2px}" +
  ".sa-sql{color:var(--anatomy-text);font-size:10px;white-space:normal;text-align:center;max-width:640px;line-height:1.4;text-transform:none}" +
  ".sa-keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px 22px}" +
  ".sa-key{align-items:center;gap:10px}.sa-key svg.sa-swatch{width:52px;height:30px;flex:none;margin:0}" +
  "@media (max-width:560px){.sa-grain{top:34px;white-space:normal}.sa-f3x .iso-plate{padding-top:316px;padding-bottom:96px}.sa-f3x .iso-plate-corner[data-corner=\"hint\"]{bottom:0;white-space:normal}.sa-f3x .iso-plate-corner[data-corner=\"readout\"]{bottom:30px}.sa-sql{max-width:300px}}";
const PAGE_CSS = `<style>.iso:not([data-theme="light"]) svg.sa-fig{${DARK}}${CONTROL_CSS}${PQ_CSS}</style>`;
const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: BODY, className: "sa-fig" });
const stillSvg = (mode) =>
  k.figureSvg({
    width: WIDTH, height: HEIGHT, label: LABEL, className: "sa-fig", standalone: mode,
    body: [`<style>${mode === "dark" ? `svg.sa-fig{${DARK}}` : ""}${PQ_CSS}</style>`, `<rect width="${WIDTH}" height="${HEIGHT}" style="fill:var(--anatomy-paper)"/>`, ...BODY],
  });
writeFileSync(join(HERE, `external-${theme}.svg`), stillSvg(theme));

function swatch(label, box, draw) {
  const W = 52, H = 30;
  const SP = k.fitProjection(box, W, H, { pad: 2, azimuth: AZIMUTH });
  const sp = makeParts(k, G, SP);
  return k.figureSvg({ width: W, height: H, label, body: draw(sp, SP), className: "sa-fig sa-swatch" });
}
const copyBox = k.boxCorners({ x: 0, y: -13, w: 18, d: 26 }, 0, 7);
const someBars = [true, true, true, false, false, false];
const bandBox = k.boxCorners({ x: 0, y: -2, w: 20, d: 4 }, 0, 1);
const band = (tone) => (sp, SP) => k.solidSvg(k.slabOf({ x: 0, y: -0.9, w: 20, d: 1.8, r: 0.5 }, 0, 0.7, SP, 2, 0.2), { tone, crease: tone === "hi" ? "lo" : "none" });
const KEYS = [
  ["A partition in cold storage, read in place: only the chunks the query needs, found through the file's own Parquet footer", copyBox, (sp) => sp.copySvg(18, 0, false) + sp.readSvg(18, { form: "copy", f0: 0.25, f1: 1, bars: someBars, z0: 0 })],
  ["Sealed, past DROP LOCAL: the object never changes", bandBox, band("hi")],
  ["In cold storage, not sealed: a late write makes QuestDB replace the object", bandBox, band("mid")],
  ["Rod: range reads from cold storage to the reader that asked for them", k.boxCorners({ x: -4, y: -4, w: 8, d: 8 }, 0, 16), (sp, SP) => k.lineSvg(k.segment([0, 0, 1], [0, 0, 15], SP), { tone: "lit" }) + k.dotsSvg([k.iso([0, 0, 1], SP), k.iso([0, 0, 15], SP)], { size: 1, tone: "hi" })],
];
const keysHtml = `<span class="iso-keys sa-keys">${KEYS.map(([label, box, draw]) => `<span class="iso-key sa-key">${swatch(label, box, draw)}<span>${label}</span></span>`).join("")}</span>`;

const range0 = rangeOf(R0);
const controls =
  `<div class="sa-grain">` +
  `<div class="sa-grain-row" role="radiogroup" aria-label="reader">READ WITH` +
  READER_ORDER.map((r) => `<button type="button" role="radio" data-reader="${r}" aria-checked="${r === "questdb"}">${READERS[r]}</button>`).join("") +
  `</div><div class="sa-grain-row" role="radiogroup" aria-label="time range">WHERE` +
  RANGES.map((r) => `<button type="button" role="radio" data-range="${r.key}" aria-checked="${r.key === R0}">${r.label}</button>`).join("") +
  `</div><div class="sa-grain-row" aria-label="selected columns">SELECT` +
  COLUMNS.map((c) => `<button type="button" data-col="${c.name}" aria-pressed="${COLS0.includes(c.name)}">${c.name}</button>`).join("") +
  `</div><div class="sa-sql sa-policy">trades · ${policySql(GRAIN)}</div><div class="sa-sql" data-sql>${sqlHtml(range0, COLS0)}</div></div>`;

const body =
  PAGE_CSS +
  `<div class="sa-plate sa-f3x">` +
  k.plateHtml({
    fig: "Fig 3",
    title: "Parquet in place",
    hint: "Pick the reader, a range and columns · space pauses",
    readout: clockOf(GRAIN, U0) + " · QuestDB: " + planText(planOf(range0, COLS0, partitionsAt(GRAIN, U0), U0)),
    keys: [],
    caption:
      "Everything TO REMOTE uploads is cold storage: one standard Parquet file per partition, on Hive-style paths such as trades~5/year=2026/month=10/day=20/data.parquet. Any engine with access to the object store can query those files in place, with no export and no copy: DuckDB or Databricks by reading the paths directly, and Trino, Athena or BigQuery through an external or Iceberg table registered over the same files, which writes only metadata. The query line shows each engine's own SQL. The underscore objects next to each file, _pm among them, are QuestDB's control data, invisible to these readers; an external engine finds the row groups and column chunks through each file's own Parquet footer. It sees only what has been uploaded: the active partition and anything newer than TO REMOTE are on QuestDB's local disk alone, so for the latest data only QuestDB has the answer. Until DROP LOCAL seals a partition, a late write can still land in it, and QuestDB then replaces the uploaded object, so an external reader can briefly see an older snapshot; sealed partitions never change. External engines must only read: QuestDB has to be the only writer to the prefix, and nothing else may replace, delete or expire its objects.",
    body: `${controls}<div class="iso-stage" tabindex="0" role="group" aria-label="Parquet in place: pick the reader, a time range and columns, hover a partition to see what each reader gets">${svg}</div>`,
  }).replace('<figcaption class="iso-legend">', '<figcaption class="iso-legend">' + keysHtml) +
  `</div>`;

const DATA = { P, u0: U0 };
const SRC = (file) => strip(readFileSync(file, "utf8"));
const latheScript = () => `const G = (() => {\n${strip(readFileSync(join(KIT_DIR, "lathe.mjs"), "utf8"))}\nreturn { frameAlong, disc };\n})();\n`;
const live = [
  SRC(join(FIG1, "model.mjs")),
  SRC(join(FIG1, "parts.mjs")),
  SRC(join(FIG1, "scene.mjs")),
  SRC(join(FIG2, "query.mjs")),
  SRC(join(FIG2, "figure.mjs")),
  SRC(join(HERE, "external.mjs")),
  SRC(join(HERE, "draw.mjs")),
  SRC(join(HERE, "live.mjs")),
  `const KIT = { ${Object.keys(k).join(", ")} };`,
  `mount(document.querySelector(".sa-f3x .iso-stage"), ${JSON.stringify(DATA)}, KIT, G);`,
].join("\n");

const file = theme === "light" ? "external-light.html" : "external.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Parquet in place", theme, body, script: kitScript() + latheScript() + live, width: 780 }));
writeFileSync(join(HERE, `fragment-${theme}.json`), JSON.stringify({ html: body, script: live }));
console.log("wrote", file);

const REACT = join(HERE, "react", "ParquetInPlace");
for (const dir of ["kit", "fig1", "fig2"]) mkdirSync(join(REACT, dir), { recursive: true });
for (const name of ["iso-kit.mjs", "lathe.mjs", "iso.css"]) copyFileSync(join(KIT_DIR, name), join(REACT, "kit", name));
for (const name of ["model.mjs", "parts.mjs", "scene.mjs"]) copyFileSync(join(FIG1, name), join(REACT, "fig1", name));
const up = (text) => text.replaceAll("../fig1-partitions/", "../fig1/");
for (const name of ["query.mjs", "figure.mjs"]) writeFileSync(join(REACT, "fig2", name), up(readFileSync(join(FIG2, name), "utf8")));
const relink = (text) => text.replaceAll("../fig1-partitions/", "./fig1/").replaceAll("../fig2-queries/", "./fig2/");
for (const name of ["external.mjs", "draw.mjs", "live.mjs"]) writeFileSync(join(REACT, name), relink(readFileSync(join(HERE, name), "utf8")));
writeFileSync(join(REACT, "plate.generated.mjs"), `// Generated by fig3-external/build.mjs. Do not edit.\nexport const PLATE_HTML = ${JSON.stringify(body)};\nexport const DATA = ${JSON.stringify(DATA)};\n`);
console.log("wrote react/ParquetInPlace");
