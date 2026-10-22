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
const HEIGHT = 470;
const S_STILL = 12.2; // the still: five days written, 2026-11-15 Parquet, the fifth day filling

// Seen nearly square to the cabinets, a little from above, so every shelf of files has room;
// the shelves' words in one column between the two cabinets.
const AZ = 90;
const EL = 20;
const probe = makeInternals(k, k.fitProjection([[0, 0, 0], [1, 1, 1]], 10, 10, { azimuth: AZ, elevation: EL }));
const { x0, x1 } = probe.extent();
const P = k.fitProjection(
  [
    ...k.boxCorners({ x: x0 - 6, y: -12, w: x1 - x0 + 12, d: 22 }, -8, ROW_Z.wal + CARD.h + 40),
    [x0 - 4, 0, ROW_Z.wal],
    [x1 + 4, 0, ROW_Z.wal],
  ],
  WIDTH,
  HEIGHT,
  { pad: 10, azimuth: AZ, elevation: EL },
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
  "Two tables' files on one instance, a card per file, each table a cabinet of shelves. On the left trades, native by default: three writers append to their own WAL segments at once, its sequencer gives their commits one order in _txnlog, apply fills the newest partition's native column files, and TO PARQUET rewrites a partition three days past its end as data.parquet and _pm. On the right trades_pq, created FORMAT PARQUET: two writers, its own sequencer, and every partition Parquet from its first row, each apply merging into data.parquet. The shelves line up, so each day sits level with the same day of the other table.";

const CONTROL_CSS =
  ".sa-f0 .iso-plate{padding-top:48px;padding-bottom:64px}" +
  ".sa-f0 .sa-grain{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:6px;font:10.5px/1 var(--anatomy-mono);letter-spacing:.06em;white-space:nowrap}" +
  ".sa-f0 .sa-grain button{font:inherit;letter-spacing:inherit;color:var(--anatomy-text);background:transparent;border:0;box-shadow:0 0 0 1px var(--anatomy-lo);padding:5px 8px;cursor:pointer;border-radius:0}" +
  '.sa-f0 .sa-grain button[aria-checked="true"]{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-strong)}' +
  ".sa-f0 .sa-grain button:focus-visible{outline:1px solid var(--anatomy-strong);outline-offset:2px}" +
  '.sa-f0 .iso-plate-corner[data-corner="readout"]{left:0;right:auto;bottom:18px;white-space:normal}' +
  '@media (max-width:560px){.sa-f0 .iso-plate{padding-bottom:110px}.sa-f0 .iso-plate-corner[data-corner="hint"]{bottom:0;white-space:normal}.sa-f0 .iso-plate-corner[data-corner="readout"]{bottom:30px}}';
const PAGE_CSS = `<style>.iso:not([data-theme="light"]) svg.sa-fig{${DARK}}${CONTROL_CSS}${PQ_CSS}</style>`;
const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: BODY, className: "sa-fig" });
const stillSvg = (mode) =>
  k.figureSvg({
    width: WIDTH, height: HEIGHT, label: LABEL, className: "sa-fig", standalone: mode,
    body: [`<style>${mode === "dark" ? `svg.sa-fig{${DARK}}` : ""}${PQ_CSS}</style>`, `<rect width="${WIDTH}" height="${HEIGHT}" style="fill:var(--anatomy-paper)"/>`, ...BODY],
  });
writeFileSync(join(HERE, `files-${theme}.svg`), stillSvg(theme));

const controls =
  `<div class="sa-grain" role="radiogroup" aria-label="scenario">` +
  Object.entries(SCENARIOS).map(([sc, { label }]) => `<button type="button" role="radio" data-scenario="${sc}" aria-checked="${sc === "policy"}">${label}</button>`).join("") +
  `</div>`;

const body =
  PAGE_CSS +
  `<div class="sa-plate sa-f0">` +
  k.plateHtml({
    fig: "Fig 1",
    title: "Native and Parquet, on disk",
    hint: "Pick a scenario · hover a file · space pauses",
    readout: stepText(S_STILL),
    keys: [],
    caption:
      "Where rows go on one instance's own disk, before any object store: two tables with the same columns, trades(ts, symbol INDEX, price, amount, venue VARCHAR) PARTITION BY DAY, side by side. trades is native by default, with STORAGE POLICY(TO PARQUET 3 DAYS); trades_pq is created FORMAT PARQUET, which needs a WAL table. Writers ingest in parallel: each appends to a WAL of its own, in segments holding a .d per column, .i for variable-size columns, and _event, one record per transaction; no writer waits for another, and every table has its own WALs and its own sequencer. txn_seq/_txnlog gives each table's commits one order, 60 bytes a transaction, and apply walks it in that order, copying each transaction's rows from its own WAL into the partition, then commits _txn. In trades the rows append to the newest partition's native column files, a file per column; a SYMBOL column stores int keys into the table's dictionary, and the indexed symbol keeps a per-partition index, .k and .v. The loop starts from two empty tables and writes five days, 2026-11-15 to 2026-11-19, each day's partition made by its first rows. Ingestion never pauses for the storage policy: at 2026-11-19 00:05, the first check after 2026-11-15 is three days past its end, TO PARQUET rewrites it, while rows keep landing in 2026-11-19, as data.parquet, row groups of 100,000 rows compressed LZ4_RAW, and _pm, QuestDB's sidecar with every chunk's byte range, codec and min/max, in a new directory; the index is hard-linked across. In trades_pq every partition is Parquet from its first row, the active one too: there is no native append, so each apply is a Parquet merge, new rows joining the last row group while it is small or starting a new one, _pm getting a new snapshot and the index rebuilt from the Parquet data; TO PARQUET has nothing to convert. So each commit costs more to apply than a native append, and the writer batches transactions to merge less often. Both tables keep the symbol dictionary at the table root, and every partition directory carries the txn it was made at, <date>.<txn>. A late row travels with the day's own rows, through the same WAL and the same _txnlog, and lands in whatever form its partition has: native column files, or merged into data.parquet, decoding and re-encoding the row group it overlaps, never back to native. The next figure adds the object store.",
    body: `${controls}<div class="iso-stage" tabindex="0" role="group" aria-label="Two tables, native and Parquet, on disk: pick a scenario, hover a file, Space pauses">${svg}</div>`,
  }) +
  `</div>`;

const DATA = { P };
const SRC = (file) => strip(readFileSync(file, "utf8"));
const live = [
  SRC(join(HERE, "files.mjs")),
  SRC(join(HERE, "draw.mjs")),
  SRC(join(HERE, "live.mjs")),
  `const KIT = { ${Object.keys(k).join(", ")} };`,
  `mount(document.querySelector(".sa-f0 .iso-stage"), ${JSON.stringify(DATA)}, KIT);`,
].join("\n");

const file = theme === "light" ? "files-light.html" : "files.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Native and Parquet, on disk", theme, body, script: kitScript() + live, width: 780 }));
writeFileSync(join(HERE, `fragment-${theme}.json`), JSON.stringify({ html: body, script: live }));
console.log("wrote", file);

const REACT = join(HERE, "react", "NativeAndParquet");
mkdirSync(join(REACT, "kit"), { recursive: true });
for (const name of ["iso-kit.mjs", "iso.css"]) copyFileSync(join(KIT_DIR, name), join(REACT, "kit", name));
for (const name of ["files.mjs", "draw.mjs", "live.mjs"]) copyFileSync(join(HERE, name), join(REACT, name));
writeFileSync(join(REACT, "plate.generated.mjs"), `// Generated by fig0-files/build.mjs. Do not edit.\nexport const PLATE_HTML = ${JSON.stringify(body)};\nexport const DATA = ${JSON.stringify(DATA)};\n`);
console.log("wrote react/NativeAndParquet");
