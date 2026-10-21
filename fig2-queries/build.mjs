import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/Users/j/.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "/Users/j/.claude/skills/anatomy/kit/lathe.mjs";
import { kitScript } from "/Users/j/.claude/skills/anatomy/scripts/inline-kit.mjs";
import { PQ_CSS, makeParts } from "../fig1-partitions/parts.mjs";
import { itemsSvg, makeScene, ticksOf } from "../fig1-partitions/scene.mjs";
import { AZIMUTH, DARK, makeStage, projectionOf } from "../fig1-partitions/stage.mjs";
import { clockOf, partitionsAt } from "../fig1-partitions/model.mjs";
import { COLUMNS, DEFAULT_COLS, DEFAULT_RANGE, GRAIN, RANGES, planOf, planText, sqlHtml } from "./query.mjs";
import { makeFigure } from "./figure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIG1 = join(HERE, "..", "fig1-partitions");
const KIT_DIR = "/Users/j/.claude/skills/anatomy/kit";
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (text) => text.replace(/^import .*$/gm, "").replace(/^export \{.*$/gm, "").replace(/^export /gm, "");

const WIDTH = 700;
const HEIGHT = 430;
const P = projectionOf(k, WIDTH, HEIGHT);
const parts = makeParts(k, G, P);
const render = makeFigure(k, P, parts, makeScene(k, P, parts));
const { deck, benchBack, head, feed, staticLabels } = makeStage(k, G, P, parts);

// One instance, as in Fig 1: the primary receives the query.
const NAMES = [["PRIMARY", "receives the SELECT"]];
// The cluster keeps running from Fig 1's start, so the stills show a busy moment.
const U0 = 60.75; // 2026-10-21 18:00
const range0 = RANGES.find((r) => r.key === DEFAULT_RANGE);
const frame = render(DEFAULT_RANGE, DEFAULT_COLS, U0, null, 0);

// Only the marks where the read path changes: TO PARQUET and DROP LOCAL.
const TIER_MARKS = [1, 2];

// Fig 1's machine, running, without its annotations; the labels say which instance
// runs the query.
const lane = (i) => [
  benchBack(i),
  parts.marksBack(i, GRAIN, TIER_MARKS),
  `<g data-part="blocks-${i}">${itemsSvg(k, P, frame.lanes[i])}</g>`,
  parts.marksFront(i, GRAIN, TIER_MARKS),
  head(i, { port: false }),
  `<g data-part="lamp-${i}">${frame.lamps[i]}</g>`,
];
const BODY = [
  deck({ bay: false, sign: "OBJECT STORE" }),
  `<g data-part="store">${itemsSvg(k, P, frame.store)}</g>`,
  `<g data-part="copy">${frame.copy}</g>`,
  ...lane(0),
  `<g data-part="caliper">${frame.caliper}</g>`,
  parts.dialSvg(ticksOf(GRAIN, U0)),
  `<path data-part="hand" class="iso-line" data-tone="lit" data-free="start" d="${frame.hand}" style="stroke-width:1"/>`,
  parts.hubSvg(),
  feed(),
  parts.rulerSvg(GRAIN, TIER_MARKS),
  `<g data-part="rods">${frame.rods}</g>`,
  `<g data-part="feed">${frame.feed}</g>`,
  `<g data-part="flying">${frame.flying}</g>`,
  staticLabels(NAMES, { extras: false, lanes: [0], bay: false }),
  parts.tiersSvg(GRAIN),
];

const LABEL =
  "The instance from Fig 1, still running, with one SELECT on it. A caliper in front of its bench marks the query's time range, relative to now, so partitions move through it as they age. Inside it, native partitions light the stretch of each selected column file the query scans, and Parquet partitions light only the column chunks of the row groups that overlap the range: local ones from its own disk, cold ones from the object store, where the same chunks light on the Parquet partition and range reads travel down a rod to the instance.";

const CONTROL_CSS =
  ".sa-f2 .iso-plate{padding-top:104px;padding-bottom:64px}" +
  '.sa-f2 .iso-plate-corner[data-corner="readout"]{left:0;right:auto;bottom:18px;white-space:normal}' +
  ".sa-grain{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:grid;justify-items:center;gap:7px;font:10.5px/1 var(--anatomy-mono);letter-spacing:.06em;color:var(--anatomy-muted);white-space:nowrap}" +
  ".sa-grain-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}" +
  ".sa-grain button{font:inherit;letter-spacing:inherit;color:var(--anatomy-text);background:transparent;border:0;box-shadow:0 0 0 1px var(--anatomy-lo);padding:5px 8px;cursor:pointer;border-radius:0}" +
  '.sa-grain button[aria-checked="true"],.sa-grain button[aria-pressed="true"]{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-strong)}' +
  ".sa-grain button:focus-visible{outline:1px solid var(--anatomy-strong);outline-offset:2px}" +
  ".sa-sql{color:var(--anatomy-text);font-size:10px;white-space:normal;text-align:center;max-width:620px;line-height:1.4;text-transform:none}" +
  ".sa-keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px 22px}" +
  ".sa-key{align-items:center;gap:10px}.sa-key svg.sa-swatch{width:52px;height:30px;flex:none;margin:0}" +
  "@media (max-width:560px){.sa-grain{top:34px;white-space:normal}.sa-f2 .iso-plate{padding-top:150px;padding-bottom:96px}.sa-f2 .iso-plate-corner[data-corner=\"hint\"]{bottom:0;white-space:normal}.sa-f2 .iso-plate-corner[data-corner=\"readout\"]{bottom:30px}.sa-sql{max-width:300px}}";
const PAGE_CSS = `<style>.iso:not([data-theme="light"]) svg.sa-fig{${DARK}}${CONTROL_CSS}${PQ_CSS}</style>`;
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
writeFileSync(join(HERE, `queries-${theme}.svg`), stillSvg(theme));

// The legend draws each key with the figure's own parts, so a key looks like what it names.
function swatch(label, box, draw) {
  const W = 52, H = 30;
  const SP = k.fitProjection(box, W, H, { pad: 2, azimuth: AZIMUTH });
  const sp = makeParts(k, G, SP);
  return k.figureSvg({ width: W, height: H, label, body: draw(sp, SP), className: "sa-fig sa-swatch" });
}
const pallet = k.boxCorners({ x: 0, y: -13, w: 18, d: 26 }, 0, 9);
const someBars = [true, true, true, false, false, false];
const KEYS = [
  ["Native partition: the query reads only the files of the selected columns, over the rows in range", pallet, (sp) => sp.blockSvg(18, { m: 0 }) + sp.readSvg(18, { form: "native", f0: 0.25, f1: 1, bars: someBars })],
  ["Parquet partition on local disk: _pm maps row groups and column chunks to byte ranges, and only those are read", pallet, (sp) => sp.blockSvg(18, { m: 1 }) + sp.readSvg(18, { form: "parquet", f0: 0.25, f1: 1, bars: someBars })],
  ["Cold partition: the same chunks, fetched from the object store by range reads; adjacent chunks share one request", k.boxCorners({ x: 0, y: -13, w: 18, d: 26 }, 0, 7), (sp) => sp.copySvg(18, 0, false) + sp.readSvg(18, { form: "copy", f0: 0.25, f1: 1, bars: someBars, z0: 0 })],
  ["Caliper: the query's time range; partitions outside it are pruned and never opened", k.boxCorners({ x: -4, y: -4, w: 26, d: 8 }, 0, 10), (sp, SP) => k.solidSvg(k.slabOf({ x: 0, y: -0.7, w: 18, d: 1.4, r: 0.3 }, 8, 1.4, SP, 2, 0.2), { tone: "lit", crease: "lo", lit: true }) + [0, 18].map((x) => k.solidSvg(k.slabOf({ x: x - 0.8, y: -0.8, w: 1.6, d: 1.6, r: 0.3 }, 0, 8, SP, 2, 0.2), { tone: "lit", crease: "lo", lit: true })).join("")],
];
const keysHtml = `<span class="iso-keys sa-keys">${KEYS.map(([label, box, draw]) => `<span class="iso-key sa-key">${swatch(label, box, draw)}<span>${label}</span></span>`).join("")}</span>`;

const controls =
  `<div class="sa-grain">` +
  `<div class="sa-grain-row" role="radiogroup" aria-label="time range">WHERE` +
  RANGES.map((r) => `<button type="button" role="radio" data-range="${r.key}" aria-checked="${r.key === DEFAULT_RANGE}">${r.label}</button>`).join("") +
  `</div><div class="sa-grain-row" aria-label="selected columns">SELECT` +
  COLUMNS.map((c) => `<button type="button" data-col="${c.name}" aria-pressed="${DEFAULT_COLS.includes(c.name)}">${c.name}</button>`).join("") +
  `</div><div class="sa-sql" data-sql>${sqlHtml(range0, DEFAULT_COLS)}</div></div>`;

const body =
  PAGE_CSS +
  `<div class="sa-plate sa-f2">` +
  k.plateHtml({
    fig: "Fig 2",
    title: "Queries across tiers",
    hint: "Tours on its own · pick a range and columns · space pauses",
    readout: clockOf(GRAIN, U0) + " · " + planText(planOf(range0, DEFAULT_COLS, partitionsAt(GRAIN, U0), U0)),
    keys: [],
    caption:
      "The same table and instance as Fig 1, still running, with one query on it. Its time range is relative to now, so partitions keep moving through it: the same query reads from different tiers as data ages. The query never names a tier: the instance that receives it serves every partition it can from its own disk and fetches the rest from the object store. Partitions outside the time range are pruned. A native partition is read from the files of the selected columns only. A Parquet partition is one data.parquet file; its _pm metadata maps every row group and column chunk to a byte range, so the query reads only the chunks of the selected columns in the row groups that overlap the range. For local Parquet those ranges come from local disk, even when a copy already sits in the object store. For a cold partition the same ranges come from the object store by range reads, adjacent ranges coalesced into one request; nothing is downloaded whole, and chunks are dropped once the query releases them. The figure assumes four row groups per partition. With replicas (Fig 3), any instance can serve the query the same way.",
    body: `${controls}<div class="iso-stage" tabindex="0" role="group" aria-label="A query across storage tiers: pick a time range and columns, hover a partition to see what is read from it">${svg}</div>`,
  }).replace('<figcaption class="iso-legend">', '<figcaption class="iso-legend">' + keysHtml) +
  `</div>`;

const DATA = { P, u0: U0, cluster: "single" };
const SRC = (file) => strip(readFileSync(file, "utf8"));
const latheScript = () => `const G = (() => {\n${strip(readFileSync(join(KIT_DIR, "lathe.mjs"), "utf8"))}\nreturn { frameAlong, disc };\n})();\n`;
const live = [
  SRC(join(FIG1, "model.mjs")),
  SRC(join(FIG1, "parts.mjs")),
  SRC(join(FIG1, "scene.mjs")),
  SRC(join(HERE, "query.mjs")),
  SRC(join(HERE, "figure.mjs")),
  SRC(join(HERE, "live.mjs")),
  `const KIT = { ${Object.keys(k).join(", ")} };`,
  `mount(document.querySelector(".sa-f2 .iso-stage"), ${JSON.stringify(DATA)}, KIT, G);`,
].join("\n");

const file = theme === "light" ? "queries-light.html" : "queries.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Queries across tiers", theme, body, script: kitScript() + latheScript() + live, width: 780 }));
console.log("wrote", file);
// the plate and its script, for the series page that shows every figure in order
writeFileSync(join(HERE, `fragment-${theme}.json`), JSON.stringify({ html: body, script: live }));

// React: the plate markup and the live modules, for the documentation site
const REACT = join(HERE, "react", "QueriesAcrossTiers");
mkdirSync(join(REACT, "kit"), { recursive: true });
mkdirSync(join(REACT, "fig1"), { recursive: true });
for (const name of ["iso-kit.mjs", "lathe.mjs", "iso.css"]) copyFileSync(join(KIT_DIR, name), join(REACT, "kit", name));
for (const name of ["model.mjs", "parts.mjs", "scene.mjs"]) copyFileSync(join(FIG1, name), join(REACT, "fig1", name));
const relink = (text) => text.replaceAll("../fig1-partitions/", "./fig1/");
for (const name of ["query.mjs", "figure.mjs", "live.mjs"]) writeFileSync(join(REACT, name), relink(readFileSync(join(HERE, name), "utf8")));
writeFileSync(join(REACT, "plate.generated.mjs"), `// Generated by fig2-queries/build.mjs. Do not edit.\nexport const PLATE_HTML = ${JSON.stringify(body)};\nexport const DATA = ${JSON.stringify(DATA)};\n`);
console.log("wrote react/QueriesAcrossTiers");
