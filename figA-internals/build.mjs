import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import { kitScript } from "../kit/inline-kit.mjs";
import { PQ_CSS } from "../fig1-partitions/parts.mjs";
import { DARK } from "../fig1-partitions/stage.mjs";
import { SCENARIOS, T, stepText } from "./files.mjs";
import { CARD, ROW_Z, makeInternals } from "./draw.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_DIR = fileURLToPath(new URL("../kit", import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (text) => text.replace(/^import .*$/gm, "").replace(/^export \{.*$/gm, "").replace(/^export /gm, "");

const WIDTH = 700;
const HEIGHT = 460;
const S_STILL = T.remote + T.stage + 0.6; // the still: after the policy's pass, every stage on show

// Seen nearly square to the cabinet, a little from above, so every shelf of files has room.
const AZ = 82;
const EL = 20;
const probe = makeInternals(k, k.fitProjection([[0, 0, 0], [1, 1, 1]], 10, 10, { azimuth: AZ, elevation: EL }));
const { x0, x1 } = probe.extent();
const P = k.fitProjection(
  [
    ...k.boxCorners({ x: x0 - 6, y: -12, w: x1 - x0 + 12, d: 22 }, -8, ROW_Z.wal + CARD.h + 16),
    [x0 - 92, 0, ROW_Z.wal],
    [x0 - 92, 0, ROW_Z.p3],
  ],
  WIDTH,
  HEIGHT,
  { pad: 12, azimuth: AZ, elevation: EL },
);
const parts = makeInternals(k, P);
const label = (pt, s, opts = {}) => {
  const [x, y] = k.iso(pt, P);
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<text class="sa-label"${opts.sub ? ' data-sub=""' : ""} x="${(x + (opts.dx ?? 0)).toFixed(1)}" y="${(y + (opts.dy ?? 0)).toFixed(1)}" text-anchor="${opts.anchor ?? "start"}">${esc}</text>`;
};
const r = parts.render(S_STILL, label);

const BODY = [
  parts.staticSvg(S_STILL),
  `<g data-part="moving">`,
  `<g data-part="fills">${r.fills}</g>`,
  `<g data-part="links">${r.links}</g>`,
  `<g data-part="flying">${r.flying}</g>`,
  `</g>`,
  parts.labelsSvg(label),
  `<g data-part="tags">${r.tags}</g>`,
];

const LABEL =
  "One Enterprise table's files, a card per file. On the left the instance's cabinet: three writers append to their own WAL segments at once on the top shelf; the sequencer below gives their commits one order in _txnlog, each record tagged with its writer; the table directory; then the active day, 2026-11-20, filling all the while, and one partition of each age below it, newest at the top: native and Parquet, both local and in cold storage, then sealed and in cold storage only, with just _pm and the symbol index kept locally. On the right the object store, a cabinet of its own, each row level with the partition it holds. Just after midnight the storage policy rewrites the three-day-old partition as Parquet locally, drops the month-old partition's local data while its _pm stays and reads reach across to the object store, and an hour later uploads the day just written.";

const CONTROL_CSS =
  ".sa-fA .iso-plate{padding-top:48px;padding-bottom:64px}" +
  ".sa-fA .sa-grain{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:6px;font:10.5px/1 var(--anatomy-mono);letter-spacing:.06em;white-space:nowrap}" +
  ".sa-fA .sa-grain button{font:inherit;letter-spacing:inherit;color:var(--anatomy-text);background:transparent;border:0;box-shadow:0 0 0 1px var(--anatomy-lo);padding:5px 8px;cursor:pointer;border-radius:0}" +
  '.sa-fA .sa-grain button[aria-checked="true"]{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-strong)}' +
  ".sa-fA .sa-grain button:focus-visible{outline:1px solid var(--anatomy-strong);outline-offset:2px}" +
  '.sa-fA .iso-plate-corner[data-corner="readout"]{left:0;right:auto;bottom:18px;white-space:normal}' +
  '@media (max-width:560px){.sa-fA .iso-plate{padding-bottom:110px}.sa-fA .iso-plate-corner[data-corner="hint"]{bottom:0;white-space:normal}.sa-fA .iso-plate-corner[data-corner="readout"]{bottom:30px}}';
const PAGE_CSS = `<style>.iso:not([data-theme="light"]) svg.sa-fig{${DARK}}${CONTROL_CSS}${PQ_CSS}</style>`;
const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: BODY, className: "sa-fig" });
const stillSvg = (mode) =>
  k.figureSvg({
    width: WIDTH, height: HEIGHT, label: LABEL, className: "sa-fig", standalone: mode,
    body: [`<style>${mode === "dark" ? `svg.sa-fig{${DARK}}` : ""}${PQ_CSS}</style>`, `<rect width="${WIDTH}" height="${HEIGHT}" style="fill:var(--anatomy-paper)"/>`, ...BODY],
  });
writeFileSync(join(HERE, `internals-${theme}.svg`), stillSvg(theme));

const controls =
  `<div class="sa-grain" role="radiogroup" aria-label="scenario">` +
  Object.entries(SCENARIOS).map(([sc, { label }]) => `<button type="button" role="radio" data-scenario="${sc}" aria-checked="${sc === "policy"}">${label}</button>`).join("") +
  `</div>`;

const body =
  PAGE_CSS +
  `<div class="sa-plate sa-fA">` +
  k.plateHtml({
    fig: "Fig 3",
    title: "Inside a table, on disk",
    hint: "Pick a scenario · hover a file · space pauses",
    readout: stepText(S_STILL),
    keys: [],
    caption:
      "The files under the storage policy, for the native table of Fig 1, trades (ts, symbol INDEX, price, amount, venue VARCHAR), now PARTITION BY DAY with STORAGE POLICY(TO REMOTE 1 HOUR, TO PARQUET 3 DAYS, DROP LOCAL 1 MONTH) and the object store of Fig 2, seen just after midnight on 2026-11-20, with the new day filling and one partition of each age below it. Ingestion never pauses for the storage policy: every stage runs while the writers keep committing. Writers ingest in parallel: each appends to a WAL of its own, wal1, wal2, wal3, in segments holding a .d per column, .i for variable-size columns, and _event, one record per transaction with its row range and any new symbols; no writer waits for another. That is what the sequencer, txn_seq, is for: _txnlog gives every writer's commits one order, each entry naming its WAL, segment and segment txn, 60 bytes a transaction, kept in parts of 5,000 that replication uploads with the segments. Apply walks _txnlog in that order and copies each transaction's rows from its own WAL into the partition's column files, then commits _txn, the table's committed state. A SYMBOL column stores int keys into the table's one dictionary, and an indexed symbol keeps a per-partition index, .k and .v. Each stage falls due once a partition's end is older than its TTL, at the next five-minute policy check, and each is independent of the others. TO REMOTE: the cold storage manager uploads a Parquet snapshot of the partition, as data.parquet with _pm.a beside it on a Hive-style path, and records it in _manifest; the local copy stays as it was, so 2026-11-19 stays native. TO PARQUET: each instance rewrites its own copy as data.parquet, row groups of 100,000 rows compressed LZ4_RAW, and _pm, QuestDB's sidecar with every chunk's byte range, codec and min/max, in a new directory, 2026-11-16.37; the index is hard-linked across, and cold storage, which already has the partition, is not touched. Until DROP LOCAL, a partition still takes late rows, native or Parquet alike: they land in the local copy, and once the partition is in cold storage the manager uploads a replacement, so the copy there never drifts. DROP LOCAL: the partition is sealed and its local data.parquet removed, so it is in cold storage only; _pm and the index stay, so a query on 2026-10-19 or 2026-10-18 still prunes and plans locally and fetches only the byte ranges it needs from the object store, and a late row for a sealed partition is skipped at apply time. A FORMAT PARQUET table, as in Fig 1, goes through the same stages, except that TO PARQUET has nothing to convert.",
    body: `${controls}<div class="iso-stage" tabindex="0" role="group" aria-label="Inside a table, from parallel writers to cold storage: pick a scenario, hover a file, Space pauses">${svg}</div>`,
  }) +
  `</div>`;

const DATA = { P };
const SRC = (file) => strip(readFileSync(file, "utf8"));
const live = [
  SRC(join(HERE, "files.mjs")),
  SRC(join(HERE, "draw.mjs")),
  SRC(join(HERE, "live.mjs")),
  `const KIT = { ${Object.keys(k).join(", ")} };`,
  `mount(document.querySelector(".sa-fA .iso-stage"), ${JSON.stringify(DATA)}, KIT);`,
].join("\n");

const file = theme === "light" ? "internals-light.html" : "internals.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Inside a table, on disk", theme, body, script: kitScript() + live, width: 780 }));
writeFileSync(join(HERE, `fragment-${theme}.json`), JSON.stringify({ html: body, script: live }));
console.log("wrote", file);

const REACT = join(HERE, "react", "FileInternals");
mkdirSync(join(REACT, "kit"), { recursive: true });
for (const name of ["iso-kit.mjs", "iso.css"]) copyFileSync(join(KIT_DIR, name), join(REACT, "kit", name));
for (const name of ["files.mjs", "draw.mjs", "live.mjs"]) copyFileSync(join(HERE, name), join(REACT, name));
writeFileSync(join(REACT, "plate.generated.mjs"), `// Generated by figA-internals/build.mjs. Do not edit.\nexport const PLATE_HTML = ${JSON.stringify(body)};\nexport const DATA = ${JSON.stringify(DATA)};\n`);
console.log("wrote react/FileInternals");
