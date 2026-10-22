// Fig 1's parts: two cabinets of shelves, one per table, each directory a tray of file cards.
// On the left trades, native by default; on the right trades_pq, FORMAT PARQUET. Top to
// bottom in each: the writers' WAL segments, the sequencer, the table directory, then a shelf
// per day, the newest at the top, empty until that day's first rows are applied. The shelves
// line up, so each day sits level with the same day of the other table. A card's key is its
// path; the Parquet table's start "q:".

import { BORN, COLUMNS, FILES, ORDERS, PARTS, ROW_GROUPS, RUNS, SLOT, T, WAL_FILES, WAL_SLOT, dayOf, stateAt } from "./files.mjs";

export const ROW_Z = { wal: 270, seq: 232, table: 188, d4: 144, d3: 108, d2: 72, d1: 36, d0: 0 };
export const SHELVES = ["wal", "seq", "table", "d4", "d3", "d2", "d1", "d0"];
export const CARD = { w: 20, d: 1.6, h: 15 };
const WAL_CARD = { w: 7.4 };
export const TRAY_Z = 1.6;
const SHELF = { y: -9, d: 18, t: 2.2 };
const FILL_TOP = 12.5;
const FILL = { tone: "lit", crease: "lo", lit: true, className: "sa-read" };
const WAL_X = [-40, 62, 164]; // where each writer's segment starts, from a cabinet's origin
const GAP = 132; // between the two cabinets, room for the shelves' words
const LOOP_FADE = 0.6;
const NATIVE = ["ts.d", "symbol.d", "price.d", "amount.d", "venue.d", "venue.i"];
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const slotAt = (x0, slot, span = 1) => [x0 + slot * SLOT - CARD.w / 2, CARD.w + (span - 1) * SLOT];
const xw = ([x, w]) => ({ x, w });

// trades: three writers; a native partition per day, the oldest turning Parquet
const LEFT = [
  ...[1, 2, 3].flatMap((w) => WAL_FILES.map((f, i) => ({ key: `wal${w}/${f}`, name: f, shelf: "wal", x: WAL_X[w - 1] + i * WAL_SLOT, w: WAL_CARD.w }))),
  ...[["_meta", 0], ["_txnlog", 1, 4], ["_wal_index.d", 5], ["_txn_parts/", 7]].map(([f, slot, span]) => ({ key: `seq/${f}`, name: f, shelf: "seq", ...xw(slotAt(0, slot, span)) })),
  ...[["_meta", 0], ["_txn", 1], ["_cv", 2], ["symbol.o", 4], ["symbol.c", 5], ["symbol.k", 6], ["symbol.v", 7]].map(([f, slot]) => ({ key: `table/${f}`, name: f, shelf: "table", ...xw(slotAt(0, slot)) })),
  ...PARTS.flatMap(({ id }) => [
    ...NATIVE.map((f) => ({ key: `${id}/${f}`, name: f, shelf: id, group: `L-${id}-n`, ...xw(slotAt(0, COLUMNS.indexOf(f))) })),
    ...["symbol.k", "symbol.v"].map((f) => ({ key: `${id}/${f}`, name: f, shelf: id, group: `L-${id}-i`, ...xw(slotAt(0, COLUMNS.indexOf(f))) })),
    ...(id === "d0" ? [{ key: "d0/data.parquet", name: "data.parquet", shelf: id, group: "L-d0-pq", ...xw(slotAt(0, 0, 5)) }, { key: "d0/_pm", name: "_pm", shelf: id, group: "L-d0-pq", ...xw(slotAt(0, 5)) }] : []),
  ]),
];
const LEFT_X = [Math.min(...LEFT.map((c) => c.x)) - 14, Math.max(...LEFT.map((c) => c.x + c.w)) + 14];
// trades_pq: two writers; every partition Parquet: data.parquet, _pm and the symbol index
const QX = LEFT_X[1] + GAP + 14 + 40; // the Parquet table's origin
const RIGHT = [
  ...[1, 2].flatMap((w) => WAL_FILES.map((f, i) => ({ key: `q:wal${w}/${f}`, name: f, shelf: "wal", x: QX + WAL_X[w - 1] + i * WAL_SLOT, w: WAL_CARD.w }))),
  ...[["_meta", 0], ["_txnlog", 1, 3], ["_wal_index.d", 4], ["_txn_parts/", 5]].map(([f, slot, span]) => ({ key: `q:seq/${f}`, name: f, shelf: "seq", ...xw(slotAt(QX, slot, span)) })),
  ...[["_meta", 0], ["_txn", 1], ["_cv", 2], ["symbol.o", 3], ["symbol.c", 4], ["symbol.k", 5], ["symbol.v", 6]].map(([f, slot]) => ({ key: `q:table/${f}`, name: f, shelf: "table", ...xw(slotAt(QX, slot)) })),
  ...PARTS.flatMap(({ id }) => [
    { key: `q:${id}/data.parquet`, name: "data.parquet", shelf: id, group: `R-${id}`, ...xw(slotAt(QX, 0, 3)) },
    { key: `q:${id}/_pm`, name: "_pm", shelf: id, group: `R-${id}`, ...xw(slotAt(QX, 3)) },
    { key: `q:${id}/symbol.k`, name: "symbol.k", shelf: id, group: `R-${id}`, ...xw(slotAt(QX, 4)) },
    { key: `q:${id}/symbol.v`, name: "symbol.v", shelf: id, group: `R-${id}`, ...xw(slotAt(QX, 5)) },
  ]),
];
const RIGHT_X = [Math.min(...RIGHT.map((c) => c.x)) - 14, Math.max(...RIGHT.map((c) => c.x + c.w)) + 14];
const CARDS = [...LEFT, ...RIGHT];
const fileOf = (key) => CARDS.find((c) => c.key === key);
const GROUPS = [...new Set(CARDS.map((c) => c.group).filter(Boolean))];
const CELLS = { trades: ORDERS.policy.trades.length, pq: ORDERS.policy.pq.length }; // _txnlog cells per table

export const describe = (key) => {
  const q = key.startsWith("q:");
  const k2 = q ? key.slice(2) : key;
  const table = q ? "trades_pq" : "trades";
  const m = k2.match(/^wal(\d)\/(.*)$/);
  if (m) return `${table} · ` + FILES.wal(m[1], m[2]);
  const p = k2.match(/^(d\d)\/(.*)$/);
  if (p) {
    const part = PARTS.find((x) => x.id === p[1]);
    const desc = q && p[2] === "data.parquet" ? FILES["pq/data.parquet"] : FILES[`partition/${p[2]}`];
    return `${table} · ${part.date} · ` + desc;
  }
  return `${table} · ` + FILES[k2];
};

// How much of each group shows at second s: a day's files appear when its first rows are
// applied, and 2026-11-15 of trades changes form at TO PARQUET. Late rows start where the
// policy loop ends; near a loop's end the groups ease to where the next loop starts (empty
// for the policy loop), so nothing jumps.
const appear = (s, at) => smooth((s - at + 0.3) / 0.3);
export const FULL = RUNS.policy.loop - 1;
function groupsAt(s) {
  const native = 1 - smooth((s - T.parquet - T.stage * 0.5) / (T.stage * 0.5));
  const pq = smooth((s - T.parquet) / 0.5);
  const o = {};
  for (const { id } of PARTS) {
    o[`L-${id}-n`] = appear(s, BORN.trades[id]) * (id === "d0" ? native : 1);
    o[`L-${id}-i`] = appear(s, BORN.trades[id]);
    o[`R-${id}`] = appear(s, BORN.pq[id]);
  }
  o["L-d0-pq"] = pq;
  return o;
}
export function opacityAt(s, scenario = "policy", next = scenario) {
  const now = groupsAt(scenario === "late" ? FULL : s), to = groupsAt(next === "late" ? FULL : 0);
  const back = smooth((s - (RUNS[scenario].loop - LOOP_FADE)) / LOOP_FADE);
  return Object.fromEntries(GROUPS.map((g) => [g, now[g] + (to[g] - now[g]) * back]));
}

export function makeInternals(k, P) {
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const slab = (plan, z, h, style, steps = 2, bevel = 0.3) => S(k.slabOf(plan, z, h, P, steps, Math.min(bevel, h / 3, plan.w / 3)), style);
  const base = (shelf) => ROW_Z[shelf] + TRAY_Z;
  const planOf = (c) => ({ x: c.x, y: -CARD.d / 2, w: c.w, d: CARD.d, r: 0.5 });
  const extent = () => ({ x0: LEFT_X[0], x1: RIGHT_X[1], left: LEFT_X, right: RIGHT_X });
  const TOP = ROW_Z.wal + CARD.h + 12;

  const trays = () => {
    const out = [];
    const tray = (cards, z) => {
      const xs = cards.flatMap((c) => [c.x, c.x + c.w]);
      out.push({ x: Math.min(...xs) - 4, y: -6, w: Math.max(...xs) - Math.min(...xs) + 8, d: 12, r: 1.2, z });
    };
    for (const [cards, prefix, writers] of [[LEFT, "", 3], [RIGHT, "q:", 2]]) {
      for (let w = 1; w <= writers; w++) tray(cards.filter((c) => c.key.startsWith(`${prefix}wal${w}/`)), ROW_Z.wal);
      for (const sh of SHELVES.slice(1)) tray(cards.filter((c) => c.shelf === sh), ROW_Z[sh]);
    }
    return out;
  };
  function cabinet([x0, x1]) {
    let out = "";
    const plinth = { x: x0 - 4, y: SHELF.y - 2, w: x1 - x0 + 8, d: SHELF.d + 4, r: 1.5 };
    out += `<path class="iso-halo" d="${k.haloOf(plinth, -8, 2, P)}"/>`;
    out += S(k.slabOf(plinth, -8, 6, P, 3, 0.6), { tone: "lo", inner: L(k.sideSeam(plinth, -6, P, 3), { tone: "faint" }) });
    out += slab({ x: x0, y: SHELF.y - 1.4, w: x1 - x0, d: 1.4, r: 0.3 }, -2, TOP + 2, { tone: "lo", crease: "none" }, 2, 0.3);
    const shelf = { x: x0, y: SHELF.y, w: x1 - x0, d: SHELF.d, r: 0.8 };
    for (const sh of SHELVES) out += S(k.slabOf(shelf, ROW_Z[sh] - SHELF.t, SHELF.t, P, 2, 0.4), { tone: "mid", inner: L(k.sideSeam(shelf, ROW_Z[sh] - 1, P, 2), { tone: "faint" }) });
    for (const x of [x0 - 3, x1]) {
      const side = { x, y: SHELF.y - 1.4, w: 3, d: SHELF.d + 1.4, r: 0.6 };
      out += S(k.slabOf(side, -2, TOP + 2, P, 2, 0.4), { tone: "mid", inner: L(k.sideSeam(side, TOP - 2, P, 2), { tone: "faint" }) });
    }
    const lid = { x: x0 - 3, y: SHELF.y - 1.4, w: x1 - x0 + 6, d: SHELF.d + 1.4, r: 0.6 };
    out += S(k.slabOf(lid, TOP, 2.2, P, 2, 0.4), { tone: "mid", inner: L(k.sideSeam(lid, TOP + 1.1, P, 2), { tone: "faint" }) });
    return out;
  }

  function cardSvg(c) {
    const plan = planOf(c);
    const pq = c.name === "_pm" || c.name === "data.parquet";
    let s = `<g data-file="${c.key}">`;
    s += S(k.slabOf(plan, base(c.shelf), CARD.h, P, 2, 0.4), { tone: pq ? "blue" : "hi", crease: "lo", className: pq ? (c.name === "_pm" ? "sa-pm" : "sa-pq") : undefined, inner: L(k.sideSeam(plan, base(c.shelf) + FILL_TOP + 0.6, P, 2), { tone: "faint" }) });
    if (c.name === "data.parquet") s += gridSvg(plan, base(c.shelf));
    if (c.name === "_txnlog") s += cellsSvg(plan, base(c.shelf), c.key.startsWith("q:") ? CELLS.pq : CELLS.trades);
    return s + `</g>`;
  }
  function gridSvg(plan, z0) {
    const y = plan.y + plan.d + 0.05;
    let lines = "";
    for (let g = 1; g < ROW_GROUPS; g++) lines += k.segment([plan.x + (g * plan.w) / ROW_GROUPS, y, z0], [plan.x + (g * plan.w) / ROW_GROUPS, y, z0 + FILL_TOP + 0.6], P);
    for (let c = 1; c < 6; c++) { const z = z0 + 0.8 + ((FILL_TOP - 0.8) * c) / 6; lines += k.segment([plan.x, y, z], [plan.x + plan.w, y, z], P); }
    return L(lines, { tone: "lo" });
  }
  const cellPlan = (plan, n, cells) => ({ x: plan.x + 1.2 + (n * (plan.w - 2.4)) / cells, w: (plan.w - 2.4) / cells - 1 });
  function cellsSvg(plan, z0, cells) {
    let lines = "";
    for (let n = 1; n < cells; n++) { const x = cellPlan(plan, n, cells).x - 0.5; lines += k.segment([x, plan.y + plan.d + 0.05, z0], [x, plan.y + plan.d + 0.05, z0 + FILL_TOP + 0.6], P); }
    return L(lines, { tone: "lo" });
  }

  const fillSvg = (key, f) => {
    if (f <= 0.01) return "";
    const c = fileOf(key);
    const inset = Math.min(1, c.w / 6);
    return slab({ x: c.x + inset, y: CARD.d / 2, w: c.w - 2 * inset, d: 0.5, r: 0.2 }, base(c.shelf) + 0.8, (FILL_TOP - 1) * Math.min(1, f), FILL, 2, 0.15);
  };
  const groupFill = (key, f) => {
    if (f <= 0.01) return "";
    const c = fileOf(key);
    let out = "";
    for (let g = 0; g < Math.ceil(f * ROW_GROUPS); g++) {
      const h = Math.min(1, f * ROW_GROUPS - g);
      out += slab({ x: c.x + 1 + (g * c.w) / ROW_GROUPS, y: CARD.d / 2, w: c.w / ROW_GROUPS - 2, d: 0.5, r: 0.2 }, base(c.shelf) + 0.8, (FILL_TOP - 1) * h, FILL, 2, 0.15);
    }
    return out;
  };

  // The cabinets and every card, the groups at their opacity for second s; every fill is
  // drawn by render(), since every partition starts empty.
  function staticSvg(s, scenario = "policy") {
    const o = opacityAt(s, scenario);
    let out = cabinet(LEFT_X) + cabinet(RIGHT_X);
    for (const t of trays()) out += slab(t, t.z, TRAY_Z, { tone: "lo", crease: "lo" }, 3, 0.4);
    const done = new Set();
    for (const c of CARDS) {
      if (!c.group) { out += cardSvg(c); continue; }
      if (done.has(c.group)) continue;
      done.add(c.group);
      out += `<g data-part="${c.group}" opacity="${o[c.group].toFixed(2)}">${CARDS.filter((m) => m.group === c.group).map(cardSvg).join("")}</g>`;
    }
    return out;
  }

  // The shelves' words sit in one column between the cabinets, since both tables have the
  // same kinds of directory and the same days: what the shelf is, then each table's state,
  // trades' first. Each table's name is above its cabinet; the WALs' names above their trays.
  const MID = (LEFT_X[1] + RIGHT_X[0]) / 2;
  const center = (label, sh, a, b) => {
    const pt = [MID, SHELF.y + SHELF.d, ROW_Z[sh] + 4];
    return label(pt, a, { anchor: "middle", dy: 0 }) + label(pt, b, { anchor: "middle", dy: 11, sub: true });
  };
  const nameOf = (label, c, dy = -4) => label([c.x + c.w / 2, CARD.d, base(c.shelf) + CARD.h], c.name, { anchor: "middle", dy, sub: true });
  function labelsSvg(label) {
    let out = "";
    out += center(label, "wal", "WRITERS", "a WAL each") + center(label, "seq", "txn_seq/", "one order each") + center(label, "table", "TABLE DIR", "schema, symbols");
    for (const [x0, n] of [[0, 3], [QX, 2]]) for (let w = 1; w <= n; w++) out += label([x0 + WAL_X[w - 1] + (WAL_FILES.length * WAL_SLOT) / 2, CARD.d, base("wal") + CARD.h], `wal${w}/0/`, { anchor: "middle", dy: -5 });
    for (const [[x0, x1], a, b] of [[LEFT_X, "trades~5/", "native · TO PARQUET 3 DAYS"], [RIGHT_X, "trades_pq~6/", "FORMAT PARQUET"]]) {
      const pt = [(x0 + x1) / 2, CARD.d, TOP + 2.2];
      out += label(pt, a, { anchor: "middle", dy: -22 }) + label(pt, b, { anchor: "middle", dy: -9, sub: true });
    }
    // on the crowded rows every other name sits higher
    const rows = { seq: [], table: [] };
    for (const c of LEFT) if (rows[c.shelf]) rows[c.shelf].push(c);
    for (const sh of ["seq", "table"]) rows[sh].forEach((c, i) => { out += nameOf(label, c, sh === "table" && c.name.startsWith("symbol") && i % 2 === 0 ? -13 : -4); });
    for (const c of RIGHT) if (c.name === "_txnlog") out += nameOf(label, c);
    return out;
  }
  // The days' words change as they fill and age; the file names show once per table, on the
  // newest day that has files.
  function partitionLabels(label, s, scenario) {
    const o = opacityAt(s, scenario);
    const active = scenario === "late" ? 4 : dayOf(s);
    let out = "";
    PARTS.forEach(({ id, date }, k) => {
      const born = o[`L-${id}-i`] >= 0.5;
      const a = born && k === active ? `${date}, active` : date;
      const b = !born ? "not yet" : id === "d0" && o["L-d0-pq"] >= 0.5 ? (scenario === "late" ? "Parquet · Parquet" : "Parquet now · Parquet") : "native · Parquet";
      out += center(label, id, a, b);
    });
    const newest = [...PARTS].reverse().find(({ id }) => o[`L-${id}-i`] >= 0.5);
    if (newest) {
      LEFT.filter((c) => c.shelf === newest.id && COLUMNS.includes(c.name)).forEach((c, i) => { out += nameOf(label, c, i % 2 === 1 ? -13 : -4); });
      RIGHT.filter((c) => c.shelf === newest.id).forEach((c) => { out += nameOf(label, c, c.name === "symbol.k" ? -13 : -4); });
    }
    if (o["L-d0-pq"] >= 0.5) for (const key of ["d0/data.parquet", "d0/_pm"]) out += nameOf(label, fileOf(key));
    return out;
  }

  const topOf = (key) => { const c = fileOf(key); return [c.x + c.w / 2, 3, base(c.shelf) + CARD.h + 1]; };
  const along = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f + 6 * Math.sin(Math.PI * f), a[2] + (b[2] - a[2]) * f];
  const chip = (pt) => slab({ x: pt[0] - 1.8, y: pt[1] - 1, w: 3.6, d: 2, r: 0.3 }, pt[2], 1.3, { tone: "lit", crease: "lo", lit: true }, 2, 0.2);
  const flash = (key, f) => { if (f <= 0) return ""; const c = fileOf(key); return `<g opacity="${(0.6 * f).toFixed(2)}">${slab(planOf(c), base(c.shelf), CARD.h, FILL, 2, 0.4)}</g>`; };
  const commitFlight = (prefix, w, f) => {
    const tray = topOf(`${prefix}wal${w}/ts.d`);
    return chip(along([tray[0] - 30, tray[1] + 18, tray[2] + 10], tray, smooth(f))) + chip(along(topOf(`${prefix}wal${w}/_event`), topOf(`${prefix}seq/_txnlog`), smooth(f)));
  };
  const COLS4 = ["ts.d", "symbol.d", "price.d", "venue.d"];
  const applyFlight = (prefix, w, targets, f) => COLS4.map((col, i) => chip(along(topOf(`${prefix}wal${w}/${col}`), topOf(targets[i % targets.length]), smooth(f)))).join("");
  // _txnlog: a lit cell per committed txn, with its writer's number
  const logCells = (prefix, list, label) => {
    const log = fileOf(`${prefix}seq/_txnlog`);
    let fills = "", tags = "";
    list.forEach((c, j) => {
      const cp = cellPlan(planOf(log), j, prefix ? CELLS.pq : CELLS.trades);
      fills += slab({ x: cp.x, y: CARD.d / 2, w: cp.w, d: 0.5, r: 0.2 }, base("seq") + 0.8, FILL_TOP - 1, FILL, 2, 0.15);
      tags += label([cp.x + cp.w / 2, CARD.d, base("seq") + 6], `${c.w}`, { anchor: "middle", dy: 3, sub: true });
    });
    return { fills, tags };
  };

  // Both scenarios: commits all through the loop, each applied in its sequencer's order to the
  // day its rows belong to. A day's native files fill as its rows arrive; trades_pq's merge
  // into the last row group while it is small, so its row groups fill one after another.
  function render(s, label, scenario = "policy", next = scenario) {
    const st = stateAt(s, scenario);
    const o = ORDERS[scenario];
    let fills = "", flying = "", tags = "";
    for (let w = 1; w <= 3; w++) for (const f of WAL_FILES) fills += fillSvg(`wal${w}/${f}`, Math.min(0.9, 0.1 + st.trades.perWriter[w - 1] * 0.22));
    for (let w = 1; w <= 2; w++) for (const f of WAL_FILES) fills += fillSvg(`q:wal${w}/${f}`, Math.min(0.9, 0.1 + st.pq.perWriter[w - 1] * 0.16));
    const a = logCells("", st.trades.committed, label), b = logCells("q:", st.pq.committed, label);
    fills += a.fills + b.fills;
    tags += a.tags + b.tags;
    const nT = st.trades.applied.length + (scenario === "late" ? CELLS.trades : 0), nQ = st.pq.applied.length + (scenario === "late" ? CELLS.pq : 0);
    fills += fillSvg("table/_txn", Math.min(0.9, 0.1 + nT * 0.06)) + fillSvg("q:table/_txn", Math.min(0.9, 0.1 + nQ * 0.06));
    if (nT) for (const f of ["symbol.o", "symbol.c", "symbol.k", "symbol.v"]) fills += fillSvg(`table/${f}`, 0.6);
    if (nQ) for (const f of ["symbol.o", "symbol.c", "symbol.k", "symbol.v"]) fills += fillSvg(`q:table/${f}`, 0.6);
    for (const { id } of PARTS) {
      const nt = Math.min(3, st.trades.perDay[id]), nq = Math.min(3, st.pq.perDay[id]);
      const converted = id === "d0" ? st.parquet : 0;
      if (nt) {
        if (converted < 1) for (const f of NATIVE) fills += `<g opacity="${(1 - converted).toFixed(2)}">${fillSvg(`${id}/${f}`, Math.min(0.9, nt * 0.45))}</g>`;
        for (const f of ["symbol.k", "symbol.v"]) fills += fillSvg(`${id}/${f}`, Math.min(0.9, nt * 0.45));
      }
      if (nq) fills += groupFill(`q:${id}/data.parquet`, nq * 0.24) + fillSvg(`q:${id}/_pm`, Math.min(0.9, nq * 0.4)) + fillSvg(`q:${id}/symbol.k`, Math.min(0.9, nq * 0.4)) + fillSvg(`q:${id}/symbol.v`, Math.min(0.9, nq * 0.4));
    }
    fills += groupFill("d0/data.parquet", st.parquet) + fillSvg("d0/_pm", st.parquet);
    for (const c of o.trades) {
      const f = (s - c.t) / T.fly;
      if (f >= 0 && f < 1) flying += commitFlight("", c.w, f);
      const fa = (s - c.at) / T.fly;
      const targets = c.p === "d0" && scenario === "late" ? ["d0/data.parquet"] : COLS4.map((x) => `${c.p}/${x}`);
      if (fa >= 0 && fa < 1) flying += applyFlight("", c.w, targets, fa);
      const landed = s - c.at - T.fly;
      if (c.late && landed >= 0 && landed < 0.9) {
        for (const key of targets) flying += flash(key, 1 - smooth(landed / 0.9));
        if (c.p === "d0") flying += flash("d0/_pm", 1 - smooth(landed / 0.9));
      }
    }
    for (const c of o.pq) {
      const f = (s - c.t) / T.fly;
      if (f >= 0 && f < 1) flying += commitFlight("q:", c.w, f);
      const fa = (s - c.at) / T.fly;
      if (fa >= 0 && fa < 1) flying += applyFlight("q:", c.w, [`q:${c.p}/data.parquet`], fa);
      const landed = s - c.at - T.fly;
      if (landed >= 0 && landed < 0.8) flying += flash(`q:${c.p}/data.parquet`, 1 - smooth(landed / 0.8)) + flash(`q:${c.p}/_pm`, 1 - smooth(landed / 0.8));
    }
    const pq = (s - T.parquet) / (T.stage * 0.7);
    if (scenario === "policy" && pq >= 0 && pq < 1) for (const col of ["ts.d", "symbol.d", "price.d", "venue.i"]) flying += chip(along(topOf(`d0/${col}`), topOf("d0/data.parquet"), smooth(pq)));
    return { fills, flying, links: "", tags: tags + partitionLabels(label, s, scenario), opacity: opacityAt(s, scenario, next), st };
  }
  return { staticSvg, labelsSvg, render, extent, describe, groups: GROUPS };
}
