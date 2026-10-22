import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { kitScript } from "../kit/inline-kit.mjs";
import { CLUSTER } from "../fig1-partitions/model.mjs";
import { BENCH, DECK, DECK_TOP, FLOOR, FLY_Z, HEAD, LANE_Y, PQ_CSS, makeParts } from "../fig1-partitions/parts.mjs";
import { itemsSvg, makeScene } from "../fig1-partitions/scene.mjs";
import { AZIMUTH, DARK, makeStage } from "../fig1-partitions/stage.mjs";
import { MODES, MODE_ORDER, SCENARIOS, SCENARIO_ORDER, simulate } from "./fail.mjs";
import { CLIENT, makeFail, storyOf } from "./draw.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIG1 = join(HERE, "..", "fig1-partitions");
const KIT_DIR = fileURLToPath(new URL("../kit", import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (text) => text.replace(/^import .*$/gm, "").replace(/^export \{.*$/gm, "").replace(/^export /gm, "");

const WIDTH = 700;
const HEIGHT = 430;
const GRAIN = "DAY";
const U_FIX = 60.75; // the benches hold still, as in Fig 4
const STILL = ["planned", "durable", 9.6]; // the still: the client replays to the new primary

// Fig 4's camera, widened to take in the client in front of the heads.
const P = k.fitProjection(
  [
    [118, LANE_Y[0] + BENCH.d / 2, FLOOR], [118, DECK.y, DECK_TOP + 12],
    [DECK.x + DECK.w, DECK.y, DECK_TOP + 12], [DECK.x + DECK.w, DECK.y + DECK.d, FLOOR],
    [CLIENT.x + CLIENT.w + 4, CLIENT.y + CLIENT.d + 4, FLOOR], [HEAD.x + HEAD.w + 110, LANE_Y[1], 0],
    [150, LANE_Y[2], FLY_Z + 4],
  ],
  WIDTH,
  HEIGHT,
  { pad: 10, azimuth: AZIMUTH },
);
const parts = makeParts(k, G, P);
const scene = makeScene(k, P, parts);
const { deck, benchBack, head } = makeStage(k, G, P, parts);
const frame = scene(GRAIN, U_FIX, null, CLUSTER);
const stillRec = simulate(STILL[0], STILL[1]);
const f = makeFail(k, P, parts)(stillRec, STILL[2]);

const lane = (i) => [
  benchBack(i),
  parts.marksBack(i, GRAIN),
  itemsSvg(k, P, frame.lanes[i]),
  parts.marksFront(i, GRAIN),
  head(i),
  frame.lamps[i],
];
const BODY = [
  deck(),
  itemsSvg(k, P, frame.store),
  `<g data-part="moving">`,
  `<g data-part="bay5">${f.bay}</g>`,
  `</g>`,
  ...[2, 1, 0].flatMap((i) => [`<g data-part="lane${i}">`, ...lane(i), `</g>`]),
  parts.rulerSvg(GRAIN, []),
  f.client,
  `<g data-part="moving2">`,
  `<g data-part="dead">${f.dead}</g>`,
  `<g data-part="ring">${f.ring}</g>`,
  `<g data-part="wire">${f.wire}</g>`,
  `<g data-part="flying">${f.flying}</g>`,
  `<g data-part="labels5">${f.labels}</g>`,
  `</g>`,
];

const LABEL =
  "The cluster from Fig 4 with a client in front of it, keeping every batch not yet acknowledged in a store-and-forward ring on its disk. In a planned switchover the operator switches the primary to a replica, which uploads what is pending and closes the client, then promotes a replica, which claims the store by writing index.msgpack with the next sync_id; the client replays its buffer to it, the old primary follows it, restarts for maintenance, and the roles are switched back. In an unplanned failure the primary crashes with transactions it never uploaded; a replica is promoted, the client replays everything past its acknowledged watermark, and the repaired node rejoins as a replica. With durable ACK nothing is lost; with plain ACK the batches acknowledged but never uploaded are lost.";

const CONTROL_CSS =
  ".sa-f5 .iso-plate{padding-top:104px;padding-bottom:64px}.sa-f5 .iso-stage svg.iso-svg{overflow:hidden}" +
  '.sa-f5 .iso-plate-corner[data-corner="readout"]{left:0;right:auto;bottom:18px;white-space:normal}' +
  ".sa-grain{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:grid;justify-items:center;gap:7px;font:10.5px/1 var(--anatomy-mono);letter-spacing:.06em;color:var(--anatomy-muted);white-space:nowrap}" +
  ".sa-grain-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}" +
  ".sa-grain button{font:inherit;letter-spacing:inherit;color:var(--anatomy-text);background:transparent;border:0;box-shadow:0 0 0 1px var(--anatomy-lo);padding:5px 8px;cursor:pointer;border-radius:0}" +
  '.sa-grain button[aria-checked="true"]{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-strong)}' +
  ".sa-grain button:focus-visible{outline:1px solid var(--anatomy-strong);outline-offset:2px}" +
  ".sa-keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px 22px}" +
  ".sa-key{align-items:center;gap:10px}.sa-key svg.sa-swatch{width:52px;height:30px;flex:none;margin:0}" +
  "@media (max-width:560px){.sa-grain{top:34px;white-space:normal}.sa-f5 .iso-plate{padding-top:170px;padding-bottom:96px}.sa-f5 .iso-plate-corner[data-corner=\"hint\"]{bottom:0;white-space:normal}.sa-f5 .iso-plate-corner[data-corner=\"readout\"]{bottom:30px}}";
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
writeFileSync(join(HERE, `failover-${theme}.svg`), stillSvg(theme));

function swatch(label, box, draw) {
  const W = 52, H = 30;
  const SP = k.fitProjection(box, W, H, { pad: 2, azimuth: AZIMUTH });
  const sp = makeParts(k, G, SP);
  return k.figureSvg({ width: W, height: H, label, body: draw(sp, SP), className: "sa-fig sa-swatch" });
}
const small = k.boxCorners({ x: -3, y: -3, w: 6, d: 6 }, 0, 2);
const cell = (SP, style) => k.solidSvg(k.slabOf({ x: -1, y: -0.8, w: 2, d: 1.6, r: 0.3 }, 0, 1.2, SP, 2, 0.3), style);
const KEYS = [
  ["Frame: one batch on the client's connection; its ack comes back as a dot", small, (sp, SP) => cell(SP, { tone: "lit", crease: "lo", lit: true })],
  ["A lit cell on the client: a frame kept on disk until it is acknowledged", small, (sp, SP) => cell(SP, { tone: "lit", crease: "lo", lit: true })],
  ["A grey frame on the dead primary: committed there but never uploaded", small, (sp, SP) => cell(SP, { tone: "lo", crease: "none" })],
  ["WAL segment in the object store, as in Fig 4", small, (sp) => sp.chipSvg([0, 0, 0], false)],
];
const keysHtml = `<span class="iso-keys sa-keys">${KEYS.map(([label, box, draw]) => `<span class="iso-key sa-key">${swatch(label, box, draw)}<span>${label}</span></span>`).join("")}</span>`;

const controls =
  `<div class="sa-grain"><div class="sa-grain-row" role="radiogroup" aria-label="scenario">` +
  SCENARIO_ORDER.map((sc) => `<button type="button" role="radio" data-scenario="${sc}" aria-checked="${sc === "planned"}">${SCENARIOS[sc].label}</button>`).join("") +
  `</div><div class="sa-grain-row" role="radiogroup" aria-label="acknowledgement">CLIENT` +
  MODE_ORDER.map((m) => `<button type="button" role="radio" data-mode="${m}" aria-checked="${m === "durable"}">${MODES[m].label}</button>`).join("") +
  `<button type="button" data-replay>REPLAY</button></div></div>`;

const body =
  PAGE_CSS +
  `<div class="sa-plate sa-f5">` +
  k.plateHtml({
    fig: "Fig 6",
    title: "Failover",
    hint: "Real time · pick a scenario and the ack mode · space pauses",
    readout: storyOf(stillRec, STILL[2]),
    keys: [],
    caption:
      "The client writes with store-and-forward: it keeps every frame on its own disk until the server acknowledges it, and replays whatever is unacknowledged after a disconnect. With plain ACK a frame is acknowledged once committed to the primary's WAL; with durable ACK (request_durable_ack=on), only once that WAL is in the object store. The primary uploads every second, the default. A planned switchover starts with SWITCH ROLE TO REPLICA on the primary: it refuses new writes, uploads every transaction it committed, flushes the client's acks and closes the connection, and from then on follows the store as a replica. It never abandons a committed transaction. The client walks its list of hosts, backing off from 100 ms, and every node answers 421 REPLICA. SWITCH ROLE TO PRIMARY on a replica is accepted once it has applied everything in the object store; while it finishes it answers 421 PRIMARY_CATCHUP, which the client retries without backing off. It then claims the store by writing index.msgpack with the next sync_id, which also fences off any node that still believes it is the primary. The client replays its buffer to it, and the old primary, now a replica, follows it. The old primary can then be restarted to apply an update, and the switch is reversed the same way: SWITCH ROLE TO REPLICA on the new primary, then SWITCH ROLE TO PRIMARY on the original one. A restart boots into replication.role, so set it to match after a switch. In an unplanned failure the primary crashes late in a window, so its last commits are in no upload. An operator promotes a replica the same way; nothing elects a new primary on its own. With durable ACK every frame the dead primary never uploaded was never acknowledged, so the client replays it and nothing is lost. With plain ACK those frames were already acknowledged and trimmed, so they are lost. The repaired node is started with replication.role=replica and rejoins as a replica. A frame that reached the store but whose ack was still on its way is replayed too and arrives twice; a DEDUP table drops the second copy.",
    body: `${controls}<div class="iso-stage" tabindex="0" role="group" aria-label="Failover with a store-and-forward client: pick the acknowledgement mode, Space pauses">${svg}</div>`,
  }).replace('<figcaption class="iso-legend">', '<figcaption class="iso-legend">' + keysHtml) +
  `</div>`;

const DATA = { P, t0: 1 };
const SRC = (file) => strip(readFileSync(file, "utf8"));
const latheScript = () => `const G = (() => {\n${strip(readFileSync(join(KIT_DIR, "lathe.mjs"), "utf8"))}\nreturn { frameAlong, disc };\n})();\n`;
const live = [
  SRC(join(FIG1, "model.mjs")),
  SRC(join(FIG1, "parts.mjs")),
  SRC(join(HERE, "fail.mjs")),
  SRC(join(HERE, "draw.mjs")),
  SRC(join(HERE, "live.mjs")),
  `const KIT = { ${Object.keys(k).join(", ")} };`,
  `mount(document.querySelector(".sa-f5 .iso-stage"), ${JSON.stringify(DATA)}, KIT, G);`,
].join("\n");

const file = theme === "light" ? "failover-light.html" : "failover.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Failover", theme, body, script: kitScript() + latheScript() + live, width: 780 }));
writeFileSync(join(HERE, `fragment-${theme}.json`), JSON.stringify({ html: body, script: live }));
console.log("wrote", file);

const REACT = join(HERE, "react", "Failover");
mkdirSync(join(REACT, "kit"), { recursive: true });
mkdirSync(join(REACT, "fig1"), { recursive: true });
for (const name of ["iso-kit.mjs", "lathe.mjs", "iso.css"]) copyFileSync(join(KIT_DIR, name), join(REACT, "kit", name));
for (const name of ["model.mjs", "parts.mjs"]) copyFileSync(join(FIG1, name), join(REACT, "fig1", name));
const relink = (text) => text.replaceAll("../fig1-partitions/", "./fig1/");
for (const name of ["fail.mjs", "draw.mjs", "live.mjs"]) writeFileSync(join(REACT, name), relink(readFileSync(join(HERE, name), "utf8")));
writeFileSync(join(REACT, "plate.generated.mjs"), `// Generated by fig6-failover/build.mjs. Do not edit.\nexport const PLATE_HTML = ${JSON.stringify(body)};\nexport const DATA = ${JSON.stringify(DATA)};\n`);
console.log("wrote react/Failover");
