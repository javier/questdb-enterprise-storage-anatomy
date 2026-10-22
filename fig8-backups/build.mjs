import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { kitScript } from "../kit/inline-kit.mjs";
import { clockOf } from "../fig1-partitions/model.mjs";
import { FLOOR, FLY_Z, HEAD, LANE_Y, PQ_CSS, RULER, X_NOW, makeParts } from "../fig1-partitions/parts.mjs";
import { itemsSvg, makeScene } from "../fig1-partitions/scene.mjs";
import { AZIMUTH, DARK, benchPlan, makeStage } from "../fig1-partitions/stage.mjs";
import { GRAIN, KEEP_DEFAULT, KEEP_ORDER } from "./backup.mjs";
import { C6, STAND, STORE6, makeBackups, storyOf } from "./draw.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIG1 = join(HERE, "..", "fig1-partitions");
const KIT_DIR = fileURLToPath(new URL("../kit", import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (text) => text.replace(/^import .*$/gm, "").replace(/^export \{.*$/gm, "").replace(/^export /gm, "");

const WIDTH = 700;
const HEIGHT = 440;
const U0 = 60.62; // just after a backup finished, while retention and the cleaner tidy up

// Fig 1's single primary, with the object store deepened for the WAL tape and the backup
// store as a second deck in front of it.
const P = k.fitProjection(
  [
    ...k.boxCorners(benchPlan(0), FLOOR, 0),
    ...k.boxCorners(benchPlan(1), FLOOR, 0),
    ...k.boxCorners(STORE6, FLOOR, STORE6.z + STORE6.t + 14),
    ...k.boxCorners({ x: STAND.x, y: STAND.y0, w: STAND.w, d: STAND.stepY * STAND.steps }, FLOOR, STAND.z0 + 3),
    ...k.boxCorners(RULER, FLOOR, FLOOR + 1),
    [X_NOW, LANE_Y[0], FLY_Z + 3],
    [HEAD.x + HEAD.w + 26, LANE_Y[0] + 8, 4],
    [HEAD.x + HEAD.w + 110, LANE_Y[1], 4],
    [STAND.x + STAND.w + 150, STAND.y0, STAND.z0],
    [STAND.x + STAND.w + 150, STAND.y0 + STAND.stepY * STAND.steps, 6],
  ],
  WIDTH,
  HEIGHT,
  { pad: 14, azimuth: AZIMUTH },
);
const parts = makeParts(k, G, P);
const scene = makeScene(k, P, parts);
const backups = makeBackups(k, P, parts);
const { deck, benchBack, head, feed, staticLabels } = makeStage(k, G, P, parts);
const frame = scene(GRAIN, U0, null, C6);
const b = backups(U0, KEEP_DEFAULT);
const items6 = (items) => items.map((it) => `<g data-id="${it.id}"${it.p !== undefined ? ` data-p="${it.p}"` : ""}${it.row !== undefined ? ` data-row="${it.row}"` : ""}${(it.opacity ?? 1) < 0.999 ? ` opacity="${it.opacity.toFixed(2)}"` : ""} transform="${k.translateAlong(P, [it.x, it.y, it.z ?? 0])}">${it.html()}</g>`).join("");

const BODY = [
  deck({ bay: false, sign: "OBJECT STORE · COLD STORAGE AND REPLICATION", plan: STORE6, board: 200 }),
  `<g data-part="store">${itemsSvg(k, P, frame.store)}</g>`,
  `<g data-part="copy">${frame.copy}</g>`,
  `<g data-part="wal6">${b.wal}</g>`,
  backups.standSvg(),
  `<g data-part="rows6">${items6(b.rows)}</g>`,
  `<g data-part="tiles6">${items6(b.tiles)}</g>`,
  ...[0, 1].flatMap((i) => [
    benchBack(i),
    parts.marksBack(i, GRAIN),
    `<g data-part="blocks-${i}">${itemsSvg(k, P, frame.lanes[i])}</g>`,
    parts.marksFront(i, GRAIN),
    head(i),
    `<g data-part="lamp-${i}">${frame.lamps[i]}</g>`,
    ...(i === 0 ? [parts.dialSvg(24), `<path data-part="hand" class="iso-line" data-tone="lit" data-free="start" d="${frame.hand}" style="stroke-width:1"/>`, parts.hubSvg()] : []),
  ]),
  parts.rulerSvg(GRAIN),
  feed(),
  `<g data-part="feed">${frame.feed}</g>`,
  `<g data-part="flying6">${b.flying}</g>`,
  // the instance names, placed by hand: the replica's head stands where Fig 1 puts the
  // primary's words, so the primary's go beside its head, at the back
  parts.label([HEAD.x + HEAD.w, LANE_Y[0] - HEAD.d / 2, HEAD.h], "PRIMARY", { anchor: "start", dx: 8, dy: -6 }),
  parts.label([HEAD.x + HEAD.w, LANE_Y[0] - HEAD.d / 2, HEAD.h], "backups · WAL cleaner · cold uploads", { anchor: "start", dx: 8, dy: 4, sub: true }),
  parts.label([HEAD.x + HEAD.w, LANE_Y[1] + HEAD.d / 2, 4], "REPLICA", { anchor: "start", dx: -6, dy: 12 }),
  parts.label([HEAD.x + HEAD.w, LANE_Y[1] + HEAD.d / 2, 4], "applies the WAL from the object store", { anchor: "start", dx: -6, dy: 22, sub: true }),
  staticLabels([], { lanes: [], bay: false }),
  parts.labelsSvg(GRAIN, { deck: false }),
  `<g data-part="labels6">${b.labels}</g>`,
];

const LABEL =
  "A primary and a replica in front of it. The primary uploads its WAL to a tape in the object store and the replica applies it from there, as in Fig 4. Behind them: the object store, holding the Parquet partitions of cold storage and the WAL tape, and in front of it the backup store, a stepped stand. Every midnight a backup runs: a checkpoint, then a diff against the last manifest, so only the partitions that changed since the last backup are uploaded, each onto a new tray at the same place along the axis as on the bench. Every other partition is a reference to the older backup that holds it. Retention keeps the latest five backups and sweeps every object no kept manifest references; objects of older backups that are still referenced stay, in the back row. The WAL cleaner then deletes WAL up to the oldest kept backup, which is as far back as a restore plus a WAL replay can reach.";

const CONTROL_CSS =
  ".sa-f6 .iso-plate{padding-top:56px;padding-bottom:64px}" +
  '.sa-f6 .iso-plate-corner[data-corner="readout"]{left:0;right:auto;bottom:18px;white-space:normal}' +
  ".sa-grain{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:grid;justify-items:center;gap:7px;font:10.5px/1 var(--anatomy-mono);letter-spacing:.06em;color:var(--anatomy-muted);white-space:nowrap}" +
  ".sa-grain-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}" +
  ".sa-grain button{font:inherit;letter-spacing:inherit;color:var(--anatomy-text);background:transparent;border:0;box-shadow:0 0 0 1px var(--anatomy-lo);padding:5px 8px;cursor:pointer;border-radius:0}" +
  '.sa-grain button[aria-checked="true"]{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-strong)}' +
  ".sa-grain button:focus-visible{outline:1px solid var(--anatomy-strong);outline-offset:2px}" +
  ".sa-keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px 22px}" +
  ".sa-key{align-items:center;gap:10px}.sa-key svg.sa-swatch{width:52px;height:30px;flex:none;margin:0}" +
  "@media (max-width:560px){.sa-grain{top:34px;white-space:normal}.sa-f6 .iso-plate{padding-top:96px;padding-bottom:96px}.sa-f6 .iso-plate-corner[data-corner=\"hint\"]{bottom:0;white-space:normal}.sa-f6 .iso-plate-corner[data-corner=\"readout\"]{bottom:30px}}";
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
writeFileSync(join(HERE, `backups-${theme}.svg`), stillSvg(theme));

// the legend, drawn with the figure's own parts
function swatch(label, box, draw) {
  const W = 52, H = 30;
  const SP = k.fitProjection(box, W, H, { pad: 2, azimuth: AZIMUTH });
  return k.figureSvg({ width: W, height: H, label, body: draw(SP), className: "sa-fig sa-swatch" });
}
const tileBox = k.boxCorners({ x: 0, y: -3, w: 16, d: 6 }, 0, 3);
const tile = (form) => (SP) => makeBackups(k, SP, makeParts(k, G, SP)).tileSvg(16, form, false);
const KEYS = [
  ["A native partition in a backup: its column files, packed", tileBox, tile("native")],
  ["A Parquet partition in a backup: data.parquet and its _pm", tileBox, tile("parquet")],
  ["A partition past DROP LOCAL in a backup: only _pm and the index; the outlined data lives only in cold storage", tileBox, tile("cold")],
  ["A backup's tray: its manifest names every partition; the tiles on it are the ones it uploaded", tileBox, (SP) => makeBackups(k, SP, makeParts(k, G, SP)).traySvg(false, { x0: 0, x1: 16 })],
];
const keysHtml = `<span class="iso-keys sa-keys">${KEYS.map(([label, box, draw]) => `<span class="iso-key sa-key">${swatch(label, box, draw)}<span>${label}</span></span>`).join("")}</span>`;

const controls =
  `<div class="sa-grain"><div class="sa-grain-row" role="radiogroup" aria-label="backup.cleanup.keep.latest.n">KEEP LATEST` +
  KEEP_ORDER.map((n) => `<button type="button" role="radio" data-keep="${n}" aria-checked="${n === KEEP_DEFAULT}">${n}</button>`).join("") +
  `<button type="button" data-backup>BACKUP DATABASE</button></div></div>`;

const body =
  PAGE_CSS +
  `<div class="sa-plate sa-f6">` +
  k.plateHtml({
    fig: "Fig 8",
    title: "Backups and WAL cleanup",
    hint: "Hover a partition or a backup · space pauses",
    readout: storyOf(U0, KEEP_DEFAULT, [], null, (t) => clockOf(GRAIN, t)),
    keys: [],
    caption:
      "One store serves three jobs at once: the replica follows the primary through the WAL tape, cold storage keeps the Parquet partitions, and the backups sit beside them. A backup runs on BACKUP DATABASE or on backup.schedule.cron, here every midnight; scheduled backups run on the primary only. It takes a checkpoint and diffs it against the last manifest in the backup store, partition by partition: a partition goes up again only if its rows, its format, or whether it is served from cold storage changed. So each night uploads yesterday's partition, the one that turned Parquet at TO PARQUET and the one that reached DROP LOCAL, and nothing else; the manifest points at older backups for the rest. There is no separate full backup: the first one simply finds everything new. A partition past DROP LOCAL is backed up as its _pm and index only, since its data lives only in cold storage, so protect that prefix together with the backups. Retention keeps the latest backup.cleanup.keep.latest.n backups, five by default, and sweeps every object no kept manifest references; an object from an older backup lives on while any kept backup still points at it. The WAL cleaner on the primary, every 10 minutes, deletes WAL segments up to the oldest of the newest five backups or checkpoints, so a restore of any kept backup can be rolled forward with point-in-time recovery to any moment since. It does not wait for replicas: the replica here applies each segment within a second, but one that falls behind the oldest kept backup stalls and has to be rebuilt from a backup. With fewer than five backups the cleaner deletes nothing. Local WAL on the primary is purged within seconds, once applied and uploaded.",
    body: `${controls}<div class="iso-stage" tabindex="0" role="group" aria-label="Backups and WAL cleanup: hover a partition or a backup tray, Space pauses">${svg}</div>`,
  }).replace('<figcaption class="iso-legend">', '<figcaption class="iso-legend">' + keysHtml) +
  `</div>`;

const DATA = { P, u0: U0 };
const SRC = (file) => strip(readFileSync(file, "utf8"));
const latheScript = () => `const G = (() => {\n${strip(readFileSync(join(KIT_DIR, "lathe.mjs"), "utf8"))}\nreturn { frameAlong, disc };\n})();\n`;
const live = [
  SRC(join(FIG1, "model.mjs")),
  SRC(join(FIG1, "parts.mjs")),
  SRC(join(FIG1, "scene.mjs")),
  SRC(join(HERE, "backup.mjs")),
  SRC(join(HERE, "draw.mjs")),
  SRC(join(HERE, "live.mjs")),
  `const KIT = { ${Object.keys(k).join(", ")} };`,
  `mount(document.querySelector(".sa-f6 .iso-stage"), ${JSON.stringify(DATA)}, KIT, G);`,
].join("\n");

const file = theme === "light" ? "backups-light.html" : "backups.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Backups and WAL cleanup", theme, body, script: kitScript() + latheScript() + live, width: 780 }));
writeFileSync(join(HERE, `fragment-${theme}.json`), JSON.stringify({ html: body, script: live }));
console.log("wrote", file);

const REACT = join(HERE, "react", "Backups");
mkdirSync(join(REACT, "kit"), { recursive: true });
mkdirSync(join(REACT, "fig1"), { recursive: true });
for (const name of ["iso-kit.mjs", "lathe.mjs", "iso.css"]) copyFileSync(join(KIT_DIR, name), join(REACT, "kit", name));
for (const name of ["model.mjs", "parts.mjs", "scene.mjs"]) copyFileSync(join(FIG1, name), join(REACT, "fig1", name));
const relink = (text) => text.replaceAll("../fig1-partitions/", "./fig1/");
for (const name of ["backup.mjs", "draw.mjs", "live.mjs"]) writeFileSync(join(REACT, name), relink(readFileSync(join(HERE, name), "utf8")));
writeFileSync(join(REACT, "plate.generated.mjs"), `// Generated by fig8-backups/build.mjs. Do not edit.\nexport const PLATE_HTML = ${JSON.stringify(body)};\nexport const DATA = ${JSON.stringify(DATA)};\n`);
console.log("wrote react/Backups");
