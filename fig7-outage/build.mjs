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
import { STAND, STORE6, makeBackups } from "../fig8-backups/draw.mjs";
import { GRAIN, W0 } from "./outage.mjs";
import { CLIENT7, makeOutage, storyOf7 } from "./draw.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const FIG1 = join(ROOT, "fig1-partitions");
const FIG8 = join(ROOT, "fig8-backups");
const KIT_DIR = fileURLToPath(new URL("../kit", import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (text) => text.replace(/^import .*$/gm, "").replace(/^export \{.*$/gm, "").replace(/^export /gm, "");

const WIDTH = 700;
const HEIGHT = 440;
const U0 = W0 + 1.4; // the still: well into the outage

// Fig 8's camera, widened for the client past the end of the feed.
const P = k.fitProjection(
  [
    ...k.boxCorners(benchPlan(0), FLOOR, 0),
    ...k.boxCorners(benchPlan(1), FLOOR, 0),
    ...k.boxCorners(STORE6, FLOOR, STORE6.z + STORE6.t + 14),
    ...k.boxCorners({ x: STAND.x, y: STAND.y0, w: STAND.w, d: STAND.stepY * STAND.steps }, FLOOR, STAND.z0 + 3),
    ...k.boxCorners(RULER, FLOOR, FLOOR + 1),
    ...k.boxCorners(CLIENT7, FLOOR, CLIENT7.h + 4),
    [X_NOW, LANE_Y[0], FLY_Z + 3],
    [CLIENT7.x + CLIENT7.w + 150, CLIENT7.y, FLOOR + 14],
    [HEAD.x + HEAD.w + 110, LANE_Y[1], 4],
    [STAND.x + STAND.w + 150, STAND.y0, STAND.z0],
  ],
  WIDTH,
  HEIGHT,
  { pad: 14, azimuth: AZIMUTH },
);
const parts = makeParts(k, G, P);
const scene = makeScene(k, P, parts);
const backups = makeBackups(k, P, parts);
const draw = makeOutage(k, P, parts, scene, backups);
const { deck, benchBack, head, feed } = makeStage(k, G, P, parts);
const r = draw(U0, 0);
const items = (list) => list.map((it) => `<g data-id="${it.id}"${it.p !== undefined ? ` data-p="${it.p}"` : ""}${(it.opacity ?? 1) < 0.999 ? ` opacity="${it.opacity.toFixed(2)}"` : ""} transform="${k.translateAlong(P, [it.x, it.y, it.z ?? 0])}">${it.html()}</g>`).join("");

const BODY = [
  `<g data-part="moving7">`,
  `<g data-part="remote" opacity="${r.remote.toFixed(2)}">`,
  deck({ bay: false, sign: "OBJECT STORE · COLD STORAGE AND REPLICATION", plan: STORE6, board: 200 }),
  `<g data-part="store">${itemsSvg(k, P, r.f.store)}</g>`,
  `<g data-part="wal6">${r.b.wal}</g>`,
  backups.standSvg(),
  `<g data-part="rows6">${items(r.b.rows)}</g>`,
  `<g data-part="tiles6">${items(r.b.tiles)}</g>`,
  `</g>`,
  `<g data-part="copy">${r.f.copy}</g>`,
  ...[0, 1].flatMap((i) => [
    benchBack(i),
    parts.marksBack(i, GRAIN),
    `<g data-part="blocks-${i}">${itemsSvg(k, P, r.f.lanes[i])}</g>`,
    parts.marksFront(i, GRAIN),
    head(i),
    `<g data-part="lamp-${i}">${r.f.lamps[i]}</g>`,
    ...(i === 0 ? [`<g data-part="pile">${r.pile}</g>`, parts.dialSvg(24), `<path data-part="hand" class="iso-line" data-tone="lit" data-free="start" d="${r.f.hand}" style="stroke-width:1"/>`, parts.hubSvg()] : []),
  ]),
  parts.rulerSvg(GRAIN),
  feed(),
  `<g data-part="feed">${r.f.feed}</g>`,
  draw.clientSvg(),
  `<g data-part="gauge">${r.gauge}</g>`,
  `<g data-part="flying6">${r.b.flying}</g>`,
  parts.labelsSvg(GRAIN, { deck: false }),
  `<g data-part="labels6">${r.b.labels}</g>`,
  `<g data-part="labels7">${r.labels}</g>`,
  `</g>`,
];

const LABEL =
  "Fig 8's cluster, a primary and a replica with the object store and the backup stand behind them, and a durable-ACK client at the end of the feed, through three days without the object store. The store dims. The primary keeps ingesting and piles up the WAL it cannot upload; the replica falls behind and keeps serving what it has; the client's buffer fills its gauge, because no durable ack comes. Partitions due for TO REMOTE wait, partitions past DROP LOCAL keep their local data, and the nightly backups fail. When the store is back, the backlog goes up, the replica catches up, and the client's buffer empties.";

const CONTROL_CSS =
  ".sa-f7o .iso-plate{padding-top:40px;padding-bottom:64px}" +
  '.sa-f7o .iso-plate-corner[data-corner="readout"]{left:0;right:auto;bottom:18px;white-space:normal}' +
  ".sa-keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px 22px}" +
  ".sa-key{align-items:center;gap:10px}.sa-key svg.sa-swatch{width:52px;height:30px;flex:none;margin:0}" +
  '@media (max-width:560px){.sa-f7o .iso-plate{padding-bottom:110px}.sa-f7o .iso-plate-corner[data-corner="hint"]{bottom:0;white-space:normal}.sa-f7o .iso-plate-corner[data-corner="readout"]{bottom:30px}}';
const PAGE_CSS = `<style>.iso:not([data-theme="light"]) svg.sa-fig{${DARK}}${CONTROL_CSS}${PQ_CSS}</style>`;
const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: BODY, className: "sa-fig" });
const stillSvg = (mode) =>
  k.figureSvg({
    width: WIDTH, height: HEIGHT, label: LABEL, className: "sa-fig", standalone: mode,
    body: [`<style>${mode === "dark" ? `svg.sa-fig{${DARK}}` : ""}${PQ_CSS}</style>`, `<rect width="${WIDTH}" height="${HEIGHT}" style="fill:var(--anatomy-paper)"/>`, ...BODY],
  });
writeFileSync(join(HERE, `outage-${theme}.svg`), stillSvg(theme));

function swatch(label, box, drawIt) {
  const W = 52, H = 30;
  const SP = k.fitProjection(box, W, H, { pad: 2, azimuth: AZIMUTH });
  return k.figureSvg({ width: W, height: H, label, body: drawIt(makeParts(k, G, SP), SP), className: "sa-fig sa-swatch" });
}
const chipBox = k.boxCorners({ x: -6, y: -2, w: 8, d: 4 }, 0, 6);
const KEYS = [
  ["WAL the primary keeps because it could not upload it; it is purged only once uploaded", chipBox, (sp) => [0, 1, 2].map((j) => sp.chipSvg([-2 - (j % 2) * 3.8, 0, j * 1.7], j === 2)).join("")],
  ["A lit cell on the client: a share of its store-and-forward buffer in use, as in Fig 6; it fills while no durable ack comes", k.boxCorners({ x: -1, y: -1, w: 2, d: 2 }, 0, 1.4), (sp, SP) => k.solidSvg(k.slabOf({ x: -0.36, y: -0.8, w: 0.72, d: 1.6, r: 0.12 }, 0, 1.4, SP, 2, 0.1), { tone: "lit", crease: "lo", lit: true })],
];
const keysHtml = `<span class="iso-keys sa-keys">${KEYS.map(([label, box, d]) => `<span class="iso-key sa-key">${swatch(label, box, d)}<span>${label}</span></span>`).join("")}</span>`;

const body =
  PAGE_CSS +
  `<div class="sa-plate sa-f7o">` +
  k.plateHtml({
    fig: "Fig 7",
    title: "Object store outage",
    hint: "Runs on its own · space pauses",
    readout: storyOf7(U0, 0, clockOf(GRAIN, U0)),
    keys: [],
    caption:
      "Nothing in QuestDB treats an object store outage as a state of its own: each part retries on its own, and nothing local depends on the store. The primary keeps ingesting and applying WAL, and its uploader retries every 200 ms, without end; every segment it could not upload keeps its pending marker, so local WAL purge keeps it, and nothing caps that growth but the disk. The replica polls every second, fails, keeps serving the data it has, and falls behind. A durable-ACK client gets no error, only no acks: its store-and-forward buffer grows, and once it reaches sf_max_total_bytes, 10 GiB on disk by default, an append blocks for 30 s and then throws; size the buffer for the longest outage you mean to ride out. Plain-ACK clients are not affected. TO REMOTE cannot upload, so the partition stays local and is retried on every policy sweep. DROP LOCAL still seals the partition, since the seal is a WAL event, but its local data is never dropped without a durable copy in cold storage, so it stays local and keeps being served. A query on a partition already served from cold storage fails with cold-storage download failed; queries on local partitions run as usual. The nightly backup fails and is listed as failed in backups(), and nothing retries it until the next run; with no new backup, the WAL cleaner deletes nothing. Promotion is refused while the store is unreachable, so the cluster stays as it is. When the store is back the backlog goes up in transaction order, the replica catches up, one cumulative durable ack trims the client's buffer, the waiting partitions upload and their seals complete. The outage drawn is three days long, to show every effect; a short one behaves the same with less to catch up. The client's ingest rate, 4 MB a minute, is an example.",
    body: `<div class="iso-stage" tabindex="0" role="group" aria-label="Object store outage: runs on its own, Space pauses">${svg}</div>`,
  }).replace('<figcaption class="iso-legend">', '<figcaption class="iso-legend">' + keysHtml) +
  `</div>`;

const DATA = { P };
const SRC = (file) => strip(readFileSync(file, "utf8"));
const latheScript = () => `const G = (() => {\n${strip(readFileSync(join(KIT_DIR, "lathe.mjs"), "utf8"))}\nreturn { frameAlong, disc };\n})();\n`;
const live = [
  SRC(join(FIG1, "model.mjs")),
  SRC(join(FIG1, "parts.mjs")),
  SRC(join(FIG1, "scene.mjs")),
  SRC(join(FIG8, "backup.mjs")),
  SRC(join(FIG8, "draw.mjs")),
  SRC(join(HERE, "outage.mjs")),
  SRC(join(HERE, "draw.mjs")),
  SRC(join(HERE, "live.mjs")),
  `const KIT = { ${Object.keys(k).join(", ")} };`,
  `mount(document.querySelector(".sa-f7o .iso-stage"), ${JSON.stringify(DATA)}, KIT, G);`,
].join("\n");

const file = theme === "light" ? "outage-light.html" : "outage.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Object store outage", theme, body, script: kitScript() + latheScript() + live, width: 780 }));
writeFileSync(join(HERE, `fragment-${theme}.json`), JSON.stringify({ html: body, script: live }));
console.log("wrote", file);

const REACT = join(HERE, "react", "ObjectStoreOutage");
for (const dir of ["kit", "fig1", "fig8"]) mkdirSync(join(REACT, dir), { recursive: true });
for (const name of ["iso-kit.mjs", "lathe.mjs", "iso.css"]) copyFileSync(join(KIT_DIR, name), join(REACT, "kit", name));
for (const name of ["model.mjs", "parts.mjs", "scene.mjs"]) copyFileSync(join(FIG1, name), join(REACT, "fig1", name));
const up = (text) => text.replaceAll("../fig1-partitions/", "../fig1/");
for (const name of ["backup.mjs", "draw.mjs"]) writeFileSync(join(REACT, "fig8", name), up(readFileSync(join(FIG8, name), "utf8")));
const relink = (text) => text.replaceAll("../fig1-partitions/", "./fig1/").replaceAll("../fig8-backups/", "./fig8/");
for (const name of ["outage.mjs", "draw.mjs", "live.mjs"]) writeFileSync(join(REACT, name), relink(readFileSync(join(HERE, name), "utf8")));
writeFileSync(join(REACT, "plate.generated.mjs"), `// Generated by fig7-outage/build.mjs. Do not edit.\nexport const PLATE_HTML = ${JSON.stringify(body)};\nexport const DATA = ${JSON.stringify(DATA)};\n`);
console.log("wrote react/ObjectStoreOutage");
