import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { kitScript } from "../kit/inline-kit.mjs";
import { CLUSTER } from "../fig1-partitions/model.mjs";
import { BENCH, DECK, DECK_TOP, FEED, FLOOR, FLY_Z, HEAD, LANE_Y, PQ_CSS, makeParts } from "../fig1-partitions/parts.mjs";
import { itemsSvg, makeScene } from "../fig1-partitions/scene.mjs";
import { AZIMUTH, DARK, makeStage } from "../fig1-partitions/stage.mjs";
import { LOADS, LOAD_ORDER, TUNINGS, TUNING_ORDER, makeSim } from "./repl.mjs";
import { makeWal } from "./wal.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIG1 = join(HERE, "..", "fig1-partitions");
const KIT_DIR = fileURLToPath(new URL("../kit", import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (text) => text.replace(/^import .*$/gm, "").replace(/^export \{.*$/gm, "").replace(/^export /gm, "");

const WIDTH = 700;
const HEIGHT = 430;
const GRAIN = "DAY";
const U_FIX = 60.75; // the benches in the WAL view: 2026-10-21 18:00, held still
const WARM = 9; // seconds of WAL simulated before the first frame, so the bay is busy

// A closer camera than Figs 1 and 2: the heads and the replication bay are the subject,
// with the youngest partitions beside them. The older end of the benches is cropped.
const P = k.fitProjection(
  [
    [118, LANE_Y[0] + BENCH.d / 2, FLOOR], [118, DECK.y, DECK_TOP + 12],
    [DECK.x + DECK.w, DECK.y, DECK_TOP + 12], [DECK.x + DECK.w, DECK.y + DECK.d, FLOOR],
    [HEAD.x + HEAD.w + 24, LANE_Y[0] + BENCH.d / 2, FLOOR], [HEAD.x + HEAD.w + 110, LANE_Y[1], 0],
    [150, LANE_Y[2], FLY_Z + 4],
  ],
  WIDTH,
  HEIGHT,
  { pad: 10, azimuth: AZIMUTH },
);
const parts = makeParts(k, G, P);
const scene = makeScene(k, P, parts);
const { deck, benchBack, head, feed } = makeStage(k, G, P, parts);
const frame = scene(GRAIN, U_FIX, null, CLUSTER);
const sim = makeSim("light");
sim.step(WARM);
const w = makeWal(k, P, parts)(sim);


const lane = (i) => [
  benchBack(i),
  parts.marksBack(i, GRAIN),
  `<g data-part="blocks-${i}">${itemsSvg(k, P, frame.lanes[i])}</g>`,
  parts.marksFront(i, GRAIN),
  head(i),
  `<g data-part="lamp-${i}">${w.lamps[i]}</g>`,
];
const BODY = [
  deck(),
  `<g data-part="store">${itemsSvg(k, P, frame.store)}</g>`,
  `<g data-part="wal"></g>`,
  `<g data-part="bay3">${w.bay}</g>`,
  ...lane(2),
  `<g data-part="copy">${frame.copy}</g>`,
  ...lane(1),
  ...lane(0),
  `<g data-part="gauge">${w.gauge}</g>`,
  `<g data-part="dial">${parts.dialSvg(10)}</g>`,
  `<path data-part="hand" class="iso-line" data-tone="lit" data-free="start" d="${w.hand}" style="stroke-width:1"/>`,
  parts.hubSvg(),
  parts.rulerSvg(GRAIN, []), // the stage marks belong to Figs 1, 2 and 4
  feed(),
  `<g data-part="rods">${frame.rods}</g>`,
  `<g data-part="feed">${frame.feed}</g>`,
  `<g data-part="flying"></g>`,
  `<g data-part="flying3">${w.flying}</g>`,
  `<g data-part="pings">${w.pings}</g>`,
  `<g data-part="names">${w.labels}</g>`,
  parts.label([FEED.x1, FEED.y, FEED.z], "ROWS FROM CLIENTS", { anchor: "start", dx: 6, dy: 6 }),
];

const LABEL =
  "The instance from Fig 1 joined by two replicas, each on its own bench with its own local disk, all sharing the object store. The primary's open WAL segment fills on a gauge on its face and its dial times the throttle window; each upload is compressed, lands in the replication bay on the object store and updates index.msgpack; each replica polls that index every second, downloads what is new and applies it, and shows how far behind it is.";

const CONTROL_CSS =
  ".sa-f3 .iso-plate{padding-top:78px;padding-bottom:64px}.sa-f3 .iso-stage svg.iso-svg{overflow:hidden}" +
  '.sa-f3 .iso-plate-corner[data-corner="readout"]{left:0;right:auto;bottom:18px;white-space:normal}' +
  ".sa-grain{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:grid;justify-items:center;gap:7px;font:10.5px/1 var(--anatomy-mono);letter-spacing:.06em;color:var(--anatomy-muted);white-space:nowrap}" +
  ".sa-grain-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}" +
  ".sa-grain button{font:inherit;letter-spacing:inherit;color:var(--anatomy-text);background:transparent;border:0;box-shadow:0 0 0 1px var(--anatomy-lo);padding:5px 8px;cursor:pointer;border-radius:0}" +
  '.sa-grain button[aria-checked="true"]{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-strong)}' +
  ".sa-grain button:focus-visible{outline:1px solid var(--anatomy-strong);outline-offset:2px}" +
  ".sa-keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px 22px}" +
  ".sa-key{align-items:center;gap:10px}.sa-key svg.sa-swatch{width:52px;height:30px;flex:none;margin:0}" +
  "@media (max-width:560px){.sa-grain{top:34px;white-space:normal}.sa-f3 .iso-plate{padding-top:120px;padding-bottom:96px}.sa-f3 .iso-plate-corner[data-corner=\"hint\"]{bottom:0;white-space:normal}.sa-f3 .iso-plate-corner[data-corner=\"readout\"]{bottom:30px}}";
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
writeFileSync(join(HERE, `replication-${theme}.svg`), stillSvg(theme));

// The legend draws each key with the figure's own parts.
function swatch(label, box, draw) {
  const W = 52, H = 30;
  const SP = k.fitProjection(box, W, H, { pad: 2, azimuth: AZIMUTH });
  const sp = makeParts(k, G, SP);
  return k.figureSvg({ width: W, height: H, label, body: draw(sp, SP), className: "sa-fig sa-swatch" });
}
const small = k.boxCorners({ x: -4, y: -4, w: 8, d: 8 }, 0, 3);
const KEYS = [
  ["WAL segment in the object store, compressed with zstd; its width follows its size, full at 2 MiB", small, (sp) => sp.chipSvg([0, 0, 0], false)],
  ["Just landed: a fresh upload, or the open segment uploaded again as it grows", small, (sp) => sp.chipSvg([0, 0, 0], true)],
  ["Gauge on the primary: its open segment, full at 2 MiB. Dial: one turn per throttle window", k.boxCorners({ x: 0, y: -1, w: 18, d: 2 }, 0, 8), (sp, SP) => k.solidSvg(k.slabOf({ x: 0, y: 0, w: 18, d: 0.4, r: 0.2 }, 0, 8, SP, 2, 0.15), { tone: "lo", crease: "none" }) + k.solidSvg(k.slabOf({ x: 0.6, y: 0.4, w: 10, d: 0.3, r: 0.15 }, 0.8, 6.4, SP, 2, 0.1), { tone: "lit", crease: "lo", lit: true })],
  ["Pulse: a replica polling index.msgpack; it downloads only what changed since it last looked", small, (sp, SP) => k.dotsSvg([k.iso([0, 0, 1.5], SP)], { size: 1.6, tone: "hi" })],
];
const keysHtml = `<span class="iso-keys sa-keys">${KEYS.map(([label, box, draw]) => `<span class="iso-key sa-key">${swatch(label, box, draw)}<span>${label}</span></span>`).join("")}</span>`;

const controls =
  `<div class="sa-grain">` +
  `<div class="sa-grain-row" role="radiogroup" aria-label="write load" data-loads>WRITE LOAD` +
  LOAD_ORDER.map((l) => `<button type="button" role="radio" data-load="${l}" aria-checked="${l === "light"}">${LOADS[l].label}</button>`).join("") +
  `</div><div class="sa-grain-row" role="radiogroup" aria-label="settings">SETTINGS` +
  TUNING_ORDER.map((t) => `<button type="button" role="radio" data-tuning="${t}" aria-checked="${t === "fast"}">${TUNINGS[t].label}</button>`).join("") +
  `</div></div>`;

const body =
  PAGE_CSS +
  `<div class="sa-plate sa-f3">` +
  k.plateHtml({
    fig: "Fig 4",
    title: "Replication",
    hint: "Real time · pick load and settings · space pauses",
    readout: `${LOADS.light.label} · ${TUNINGS.fast.label} · segment ${sim.s.seg.id} open`,
    keys: [],
    caption:
      "The instance from Figs 1 and 2 becomes the primary of a cluster, and two replicas join it. Replication goes through the same object store as cold storage, under its own root. Each commit lands in the primary's open WAL segment. The segment is uploaded when it reaches 2 MiB (cairo.wal.segment.rollover.size), or when the throttle window (replication.primary.throttle.window.duration) runs out, whichever comes first, so an open segment is uploaded again each window as it grows, until it rolls over. Uploads are compressed with zstd, about 8 to 1, and stored as wal{N}/{segment}.tar.zst, with the commit order in _txn_parts and an index.msgpack that says what exists. Each replica polls that index (replication.replica.poll.interval) on its own clock, downloads only what changed and applies it. With the defaults, a 1 second window and a 1 second poll, replicas run up to about 2 seconds behind. Tuned to 250 ms each, as shown first here, they stay within about 1 second, at the cost of more object store requests: one upload per window and one index read per poll. On GCS the window must stay at 1 second or more. The view runs in real time; uploads and downloads are drawn a little slower than they take, so each stays visible. Fig 5 shows the storage policy from Fig 1 running across this cluster, where the DROP LOCAL seal travels through this same WAL.",
    body: `${controls}<div class="iso-stage" tabindex="0" role="group" aria-label="Replication through the object store: switch views and load, Space pauses">${svg}</div>`,
  }).replace('<figcaption class="iso-legend">', '<figcaption class="iso-legend">' + keysHtml) +
  `</div>`;

const DATA = { P, uFix: U_FIX, warm: WARM };
const SRC = (file) => strip(readFileSync(file, "utf8"));
const latheScript = () => `const G = (() => {\n${strip(readFileSync(join(KIT_DIR, "lathe.mjs"), "utf8"))}\nreturn { frameAlong, disc };\n})();\n`;
const live = [
  SRC(join(FIG1, "model.mjs")),
  SRC(join(FIG1, "parts.mjs")),
  SRC(join(FIG1, "scene.mjs")),
  SRC(join(HERE, "repl.mjs")),
  SRC(join(HERE, "wal.mjs")),
  SRC(join(HERE, "live.mjs")),
  `const KIT = { ${Object.keys(k).join(", ")} };`,
  `mount(document.querySelector(".sa-f3 .iso-stage"), ${JSON.stringify(DATA)}, KIT, G);`,
].join("\n");

const file = theme === "light" ? "replication-light.html" : "replication.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Replication", theme, body, script: kitScript() + latheScript() + live, width: 780 }));
writeFileSync(join(HERE, `fragment-${theme}.json`), JSON.stringify({ html: body, script: live }));
console.log("wrote", file);

const REACT = join(HERE, "react", "Replication");
mkdirSync(join(REACT, "kit"), { recursive: true });
mkdirSync(join(REACT, "fig1"), { recursive: true });
for (const name of ["iso-kit.mjs", "lathe.mjs", "iso.css"]) copyFileSync(join(KIT_DIR, name), join(REACT, "kit", name));
for (const name of ["model.mjs", "parts.mjs", "scene.mjs"]) copyFileSync(join(FIG1, name), join(REACT, "fig1", name));
const relink = (text) => text.replaceAll("../fig1-partitions/", "./fig1/");
for (const name of ["repl.mjs", "wal.mjs", "live.mjs"]) writeFileSync(join(REACT, name), relink(readFileSync(join(HERE, name), "utf8")));
writeFileSync(join(REACT, "plate.generated.mjs"), `// Generated by fig4-replication/build.mjs. Do not edit.\nexport const PLATE_HTML = ${JSON.stringify(body)};\nexport const DATA = ${JSON.stringify(DATA)};\n`);
console.log("wrote react/Replication");
