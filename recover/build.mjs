// Builds Fig 9 (a new replica from a backup) or Fig 10 (point-in-time recovery), which share
// this folder's model, drawing and live code:
//   node recover/build.mjs --fig replica [--light]   writes fig9-replica/
//   node recover/build.mjs --fig pitr [--light]      writes fig10-pitr/
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { kitScript } from "../kit/inline-kit.mjs";
import { nameOf } from "../fig1-partitions/model.mjs";
import { FLOOR, FLY_Z, HEAD, LANE_Y, PQ_CSS, RULER, X_NOW, makeParts } from "../fig1-partitions/parts.mjs";
import { itemsSvg, makeScene } from "../fig1-partitions/scene.mjs";
import { AZIMUTH, DARK, benchPlan, makeStage } from "../fig1-partitions/stage.mjs";
import { GRAIN } from "../fig8-backups/backup.mjs";
import { C6, STAND, STORE6, makeBackups } from "../fig8-backups/draw.mjs";
import { FIGURES, MODES, SOURCE_U, targetRange } from "./restore.mjs";
import { NEW, NEWSTORE, makeRestore, storyOf7 } from "./draw.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const FIG1 = join(ROOT, "fig1-partitions");
const FIG6 = join(ROOT, "fig8-backups");
const KIT_DIR = fileURLToPath(new URL("../kit", import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const fig = process.argv[process.argv.indexOf("--fig") + 1];
if (!FIGURES[fig]) throw new Error("--fig replica | pitr");
const pitr = fig === "pitr";
const OUT = join(ROOT, pitr ? "fig10-pitr" : "fig9-replica");
const NAME = pitr ? "pitr" : "replica";
const CLASS = pitr ? "sa-f8" : "sa-f7";
const strip = (text) => text.replace(/^import .*$/gm, "").replace(/^export \{.*$/gm, "").replace(/^export /gm, "");

const WIDTH = 700;
const HEIGHT = 470;
const range = targetRange();
const T_STILL = range.min + (range.max - range.min) * 0.55;
const MODE0 = FIGURES[fig][0];
const S_STILL = 7.2; // the still: the WAL replay under way

const P = k.fitProjection(
  [
    ...[0, 1, NEW].flatMap((i) => k.boxCorners(benchPlan(i), FLOOR, 0)),
    ...k.boxCorners(STORE6, FLOOR, STORE6.z + STORE6.t + 14),
    ...k.boxCorners({ x: STAND.x, y: STAND.y0, w: STAND.w, d: STAND.stepY * STAND.steps }, FLOOR, STAND.z0 + 3),
    ...k.boxCorners(RULER, FLOOR, FLOOR + 1),
    ...(pitr ? k.boxCorners(NEWSTORE, FLOOR, NEWSTORE.z + 12) : []),
    [X_NOW, LANE_Y[0], FLY_Z + 3],
    [HEAD.x + HEAD.w + 150, LANE_Y[0], HEAD.h],
    [HEAD.x + HEAD.w + 150, LANE_Y[1], HEAD.h],
    [HEAD.x + HEAD.w + 110, LANE_Y[NEW], 4],
    [STAND.x + STAND.w + 150, STAND.y0, STAND.z0],
    [STAND.x + STAND.w + 150, STAND.y0 + STAND.stepY * STAND.steps, 6],
    ...(pitr ? [[NEWSTORE.x + NEWSTORE.w + 120, NEWSTORE.y + NEWSTORE.d, NEWSTORE.z]] : []),
  ],
  WIDTH,
  HEIGHT,
  { pad: 14, azimuth: AZIMUTH },
);
const parts = makeParts(k, G, P);
const scene = makeScene(k, P, parts);
const backups = makeBackups(k, P, parts);
const draw = makeRestore(k, P, parts, backups);
const { deck, benchBack, head, feed } = makeStage(k, G, P, parts);
const frame = scene(GRAIN, SOURCE_U, null, C6);
const f = draw(MODE0, T_STILL, S_STILL);
const items = (list) => list.map((it) => `<g data-id="${it.id}"${(it.opacity ?? 1) < 0.999 ? ` opacity="${it.opacity.toFixed(2)}"` : ""} transform="${k.translateAlong(P, [it.x, it.y, it.z ?? 0])}">${it.html()}</g>`).join("");
const sourceLane = (i) => [benchBack(i), parts.marksBack(i, GRAIN), itemsSvg(k, P, frame.lanes[i]), parts.marksFront(i, GRAIN), head(i)];

const BODY = [
  deck({ bay: false, sign: "OBJECT STORE · COLD STORAGE AND REPLICATION", plan: STORE6, board: 200 }),
  itemsSvg(k, P, frame.store),
  `<g data-part="wal6">${f.src.wal}</g>`,
  backups.standSvg(),
  `<g data-part="rows6">${items(f.src.rows)}</g>`,
  `<g data-part="tiles6">${items(f.src.tiles)}</g>`,
  ...sourceLane(0),
  parts.dialSvg(24),
  `<path class="iso-line" data-tone="lit" data-free="start" d="${frame.hand}" style="stroke-width:1"/>`,
  parts.hubSvg(),
  feed(),
  frame.feed,
  ...sourceLane(1),
  pitr ? draw.fenceSvg() : "",
  `<g data-part="marks7">${f.marks}</g>`,
  benchBack(NEW),
  parts.marksBack(NEW, GRAIN),
  `<g data-part="blocks-new">${items(f.blocks)}</g>`,
  parts.marksFront(NEW, GRAIN),
  head(NEW),
  pitr ? `<g data-part="newstore7" opacity="${f.newStore.toFixed(2)}">${deck({ bay: false, sign: "NEW", plan: NEWSTORE, board: 30 })}${draw.coldCopySvg()}</g>` : "",
  `<g data-part="newwal7">${f.newWal}</g>`,
  parts.rulerSvg(GRAIN),
  `<g data-part="flying7">${f.flying}</g>`,
  parts.labelsSvg(GRAIN, { deck: false }),
  `<g data-part="labels6">${f.src.labels}</g>`,
  `<g data-part="labels7">${f.labels}</g>`,
];

const TEXT = pitr
  ? {
      fig: "Fig 10",
      title: "Point-in-time recovery",
      label: "Fig 8's cluster, a primary and a replica, keeps running at the back. In front of a line on the floor, a new, empty instance recovers to a chosen moment: it restores the newest kept backup before it, eight partitions at a time from the backup steps, then replays WAL from the source's tape up to the target, so its data stops at the target post. With a fresh DataID it leaves for good: as the primary of a new cluster on its own, empty object store, or standalone. Partitions past DROP LOCAL read from a copy of the cold storage prefix.",
      lead: "Recovering to a moment, without touching the cluster. A new instance restores a kept backup, replays WAL up to the target, and leaves with a fresh DataID: as the primary of a new cluster, or standalone.",
      hint: "Pick a mode and a target · space pauses",
      caption:
        "Point-in-time recovery builds a new instance in two boots and leaves the source cluster exactly as it was. The first boot, with an empty db/ and no replication configured, runs _backup_restore: the newest kept backup at or before the target, every partition its manifest names fetched from whichever backup prefix holds it, eight streams at a time by default. A partition past DROP LOCAL comes back as its _pm and index only. The second boot runs _recover_point_in_time with the source's replication.object.store and replication.recovery.timestamp: it replays WAL up to the last commit at or before the target, then takes a fresh DataID. From then on it has nothing to do with the source. As the primary of a new cluster it needs a brand new, empty object store of its own, since one that already holds replication data is refused; standalone, it replicates nothing. Either way, if the table uses cold storage, point cold.storage.object.store at a copy of the cold storage prefix, with the role left at refresher, never at the live prefix the source cluster still manages. The target can reach back only to the oldest kept backup, where the WAL cleaner has trimmed the tape; aim earlier and recovery reports success with data missing.",
    }
  : {
      fig: "Fig 9",
      title: "Replica from backup",
      label: "Fig 8's cluster, a primary and a first replica, keeps running. A second replica joins on the front bench: it restores a kept backup, eight partitions at a time from the backup steps, then replays WAL from the store's tape up to now and keeps following the primary like the first replica. Starting from the oldest kept backup takes the same restore but a longer replay.",
      lead: "Adding a replica without copying everything from the primary. A new instance restores a kept backup, replays the WAL since, and joins the cluster as replica 2.",
      hint: "Pick the backup to start from · space pauses",
      caption:
        "A second replica can start from a backup instead of an empty disk. It boots once, with _backup_restore naming the backup store and instance, replication.role=replica and the cluster's replication.object.store. The restore takes the backup's manifest and fetches every partition it names from whichever backup prefix holds it, eight streams at a time by default; a partition past DROP LOCAL comes back as its _pm and index only and reads its data from the cluster's own cold storage prefix, as a refresher. The node then replays WAL from the store, from the backup's txns to the latest, and keeps following the primary: it keeps the backup's DataID, so it belongs to this cluster. Any kept backup works; an older one means more WAL to replay. A base older than the WAL kept in the store fails with ER003, which is why the WAL cleaner trims only to the oldest kept backup. Give the new replica its own cairo.snapshot.instance.id.",
    };

const CONTROL_CSS =
  `.${CLASS} .iso-plate{padding-top:${pitr ? 84 : 56}px;padding-bottom:64px}` +
  `.${CLASS} .iso-plate-corner[data-corner="readout"]{left:0;right:auto;bottom:18px;white-space:normal}` +
  ".sa-grain{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:grid;justify-items:center;gap:7px;font:10.5px/1 var(--anatomy-mono);letter-spacing:.06em;color:var(--anatomy-muted);white-space:nowrap}" +
  ".sa-grain-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}" +
  ".sa-grain button{font:inherit;letter-spacing:inherit;color:var(--anatomy-text);background:transparent;border:0;box-shadow:0 0 0 1px var(--anatomy-lo);padding:5px 8px;cursor:pointer;border-radius:0}" +
  '.sa-grain button[aria-checked="true"]{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-strong)}' +
  ".sa-grain button:focus-visible,.sa-grain input:focus-visible{outline:1px solid var(--anatomy-strong);outline-offset:2px}" +
  ".sa-grain input[type=range]{width:220px;accent-color:var(--anatomy-strong)}" +
  ".sa-grain [data-target-text]{color:var(--anatomy-text);min-width:16ch}" +
  ".sa-keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px 22px}" +
  ".sa-key{align-items:center;gap:10px}.sa-key svg.sa-swatch{width:52px;height:30px;flex:none;margin:0}" +
  `@media (max-width:560px){.sa-grain{top:34px;white-space:normal}.${CLASS} .iso-plate{padding-top:${pitr ? 140 : 100}px;padding-bottom:96px}.${CLASS} .iso-plate-corner[data-corner="hint"]{bottom:0;white-space:normal}.${CLASS} .iso-plate-corner[data-corner="readout"]{bottom:30px}}`;
const PAGE_CSS = `<style>.iso:not([data-theme="light"]) svg.sa-fig{${DARK}}${CONTROL_CSS}${PQ_CSS}</style>`;
const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: TEXT.label, body: BODY, className: "sa-fig" });
const stillSvg = (mode) =>
  k.figureSvg({
    width: WIDTH, height: HEIGHT, label: TEXT.label, className: "sa-fig", standalone: mode,
    body: [`<style>${mode === "dark" ? `svg.sa-fig{${DARK}}` : ""}${PQ_CSS}</style>`, `<rect width="${WIDTH}" height="${HEIGHT}" style="fill:var(--anatomy-paper)"/>`, ...BODY],
  });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `${NAME}-${theme}.svg`), stillSvg(theme));

const clock = (t) => { const h = Math.floor((((t % 1) + 1) % 1) * 24); return `${nameOf(GRAIN, t + 1e-6)} ${String(h).padStart(2, "0")}:00`; };
const buttons = FIGURES[fig].map((m) => `<button type="button" role="radio" data-mode="${m}" aria-checked="${m === MODE0}">${MODES[m].label}</button>`).join("");
const controls = pitr
  ? `<div class="sa-grain"><div class="sa-grain-row" role="radiogroup" aria-label="recovery">${buttons}</div>` +
    `<div class="sa-grain-row"><label for="sa-f8-target">TARGET</label><input id="sa-f8-target" type="range" data-target min="${range.min}" max="${range.max}" step="${1 / 24}" value="${T_STILL}"><span data-target-text>${clock(T_STILL)}</span><button type="button" data-again>RUN AGAIN</button></div></div>`
  : `<div class="sa-grain"><div class="sa-grain-row" role="radiogroup" aria-label="base backup">${buttons}<button type="button" data-again>RUN AGAIN</button></div></div>`;

// the legend, drawn with the figure's own parts
function swatch(label, box, draw) {
  const W = 52, H = 30;
  const SP = k.fitProjection(box, W, H, { pad: 2, azimuth: AZIMUTH });
  const sp = makeParts(k, G, SP);
  return k.figureSvg({ width: W, height: H, label, body: draw(sp, SP), className: "sa-fig sa-swatch" });
}
const pallet = k.boxCorners({ x: 0, y: -13, w: 18, d: 26 }, 0, 9);
const tileBox = k.boxCorners({ x: 0, y: -3, w: 16, d: 6 }, 0, 3);
const chipBox = k.boxCorners({ x: -2, y: -1.6, w: 4, d: 3.2 }, 0, 1.8);
const KEYS = [
  ["A partition on its way down from the backup step that holds it", tileBox, (sp, SP) => makeBackups(k, SP, sp).tileSvg(16, "native", true)],
  ["Native partition on an instance: one bar per column file", pallet, (sp) => sp.blockSvg(18, { m: 0 })],
  ["Parquet partition on an instance, with its _pm in solid blue", pallet, (sp) => sp.blockSvg(18, { m: 1 })],
  ["Past DROP LOCAL: only _pm and the index are local, the data is read from cold storage", pallet, (sp) => sp.blockSvg(18, { m: 1, sealed: 1, evict: 1 })],
  ["WAL segment, replayed from the tape in the object store (lit while replaying)", chipBox, (sp) => sp.chipSvg([0, 0, 0], true)],
  ...(pitr
    ? [
        ["Target: the recovered data stops at the last commit at or before it", k.boxCorners({ x: -2, y: -2, w: 4, d: 4 }, 0, 15), (sp, SP) => k.lineSvg(k.segment([0, 0, 0], [0, 0, 14], SP), { tone: "lit" }) + k.dotsSvg([k.iso([0, 0, 0], SP), k.iso([0, 0, 14], SP)], { size: 1, tone: "hi" })],
        ["A copy of the cold storage prefix, in the recovered node's own store", k.boxCorners({ x: 0, y: -13, w: 18, d: 26 }, 0, 7), (sp) => sp.copySvg(18, 0, false)],
        ["The boundary of the source cluster, which the recovery never touches", k.boxCorners({ x: 0, y: -2, w: 20, d: 4 }, 0, 15), (sp, SP) => {
          let out = "";
          for (const x of [2, 10, 18]) out += k.solidSvg(k.cylinder(x, 0, 0.8, 0, 14, SP, 14), { tone: "mid" });
          return out + k.solidSvg(k.slabOf({ x: 1, y: -0.6, w: 18, d: 1.2, r: 0.4 }, 14, 1, SP, 2, 0.3), { tone: "hi", crease: "lo" });
        }],
      ]
    : []),
];
const keysHtml = `<span class="iso-keys sa-keys">${KEYS.map(([label, box, draw]) => `<span class="iso-key sa-key">${swatch(label, box, draw)}<span>${label}</span></span>`).join("")}</span>`;

const body =
  PAGE_CSS +
  `<div class="sa-plate ${CLASS}">` +
  k.plateHtml({
    fig: TEXT.fig,
    title: TEXT.title,
    hint: TEXT.hint,
    readout: storyOf7(MODE0, T_STILL, S_STILL, clock),
    keys: [],
    caption: TEXT.caption,
    body: `${controls}<div class="iso-stage" tabindex="0" role="group" aria-label="${TEXT.title}: ${TEXT.hint.replace(" · space pauses", "")}, Space pauses">${svg}</div>`,
  }).replace('<figcaption class="iso-legend">', '<figcaption class="iso-legend">' + keysHtml) +
  `</div>`;

const DATA = { P, figure: fig };
const SRC = (file) => strip(readFileSync(file, "utf8"));
const latheScript = () => `const G = (() => {\n${strip(readFileSync(join(KIT_DIR, "lathe.mjs"), "utf8"))}\nreturn { frameAlong, disc };\n})();\n`;
const live = [
  SRC(join(FIG1, "model.mjs")),
  SRC(join(FIG1, "parts.mjs")),
  SRC(join(FIG1, "scene.mjs")),
  SRC(join(FIG6, "backup.mjs")),
  SRC(join(FIG6, "draw.mjs")),
  SRC(join(HERE, "restore.mjs")),
  SRC(join(HERE, "draw.mjs")),
  SRC(join(HERE, "live.mjs")),
  `const KIT = { ${Object.keys(k).join(", ")} };`,
  `mount(document.querySelector(".${CLASS} .iso-stage"), ${JSON.stringify(DATA)}, KIT, G);`,
].join("\n");

const file = theme === "light" ? `${NAME}-light.html` : `${NAME}.html`;
writeFileSync(join(OUT, file), k.pageHtml({ title: TEXT.title, theme, body, script: kitScript() + latheScript() + live, width: 780 }));
writeFileSync(join(OUT, `fragment-${theme}.json`), JSON.stringify({ html: body, script: live, lead: TEXT.lead }));
console.log("wrote", join(pitr ? "fig10-pitr" : "fig9-replica", file));

const REACT = join(OUT, "react", pitr ? "PointInTimeRecovery" : "ReplicaFromBackup");
for (const dir of ["kit", "fig1", "fig6", "recover"]) mkdirSync(join(REACT, dir), { recursive: true });
for (const name of ["iso-kit.mjs", "lathe.mjs", "iso.css"]) copyFileSync(join(KIT_DIR, name), join(REACT, "kit", name));
for (const name of ["model.mjs", "parts.mjs", "scene.mjs"]) copyFileSync(join(FIG1, name), join(REACT, "fig1", name));
const up = (text) => text.replaceAll("../fig1-partitions/", "../fig1/").replaceAll("../fig8-backups/", "../fig6/");
for (const name of ["backup.mjs", "draw.mjs"]) writeFileSync(join(REACT, "fig6", name), up(readFileSync(join(FIG6, name), "utf8")));
for (const name of ["restore.mjs", "draw.mjs", "live.mjs"]) writeFileSync(join(REACT, "recover", name), up(readFileSync(join(HERE, name), "utf8")));
writeFileSync(join(REACT, "plate.generated.mjs"), `// Generated by recover/build.mjs. Do not edit.\nexport const PLATE_HTML = ${JSON.stringify(body)};\nexport const DATA = ${JSON.stringify(DATA)};\n`);
console.log("wrote react", REACT.split("/").slice(-1)[0]);
