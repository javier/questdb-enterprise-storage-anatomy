// Fig 3's parts: the instance's cabinet of shelves, each directory a tray of file
// cards, and beside it the object store as a cabinet of its own. In the instance, top to
// bottom: three writers' WAL segments side by side, the sequencer, the table directory, then
// one partition of each age, newest first. Each object store row sits level with the
// partition it holds, and its top shelf, level with the table directory, holds _manifest.

import { COLUMNS, FILES, LATE, LATE_ORDER, LATE_T, ORDER, PARTS, ROW_GROUPS, SLOT, T, WAL_FILES, WAL_SLOT, WRITERS, applyAt, stateAt } from "./files.mjs";

export const ROW_Z = { wal: 270, seq: 232, table: 188, pa: 144, p0: 108, p1: 72, p2: 36, p3: 0 };
export const SHELVES = ["wal", "seq", "table", "pa", "p0", "p1", "p2", "p3"];
const STORE_SHELVES = ["table", "pa", "p0", "p1", "p2", "p3"]; // nothing at the active day's level: nothing of it is uploaded
export const CARD = { w: 20, d: 1.6, h: 15 };
const WAL_CARD = { w: 7.4 };
export const TRAY_Z = 1.6;
const SHELF = { y: -9, d: 18, t: 2.2 };
const FILL_TOP = 12.5;
const FILL = { tone: "lit", crease: "lo", lit: true, className: "sa-read" };
const WAL_X = [-40, 62, 164]; // where each writer's segment starts
const GAP = 34; // between the instance's cabinet and the object store's
const LOOP_FADE = 0.6;
const NATIVE = ["ts.d", "symbol.d", "price.d", "amount.d", "venue.d", "venue.i"];
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const slotAt = (x0, slot, span = 1) => [x0 + slot * SLOT - CARD.w / 2, CARD.w + (span - 1) * SLOT];
const partOf = (id) => PARTS.find((p) => p.id === id);

// Every card: { key, name, shelf, x, w, group, store }. A card in a group comes and goes with it.
const LOCAL_CARDS = [
  ...[1, 2, 3].flatMap((w) => WAL_FILES.map((f, i) => ({ key: `wal${w}/${f}`, name: f, shelf: "wal", x: WAL_X[w - 1] + i * WAL_SLOT, w: WAL_CARD.w }))),
  ...[["_meta", 0], ["_txnlog", 1, 4], ["_wal_index.d", 5], ["_txn_parts/", 7]].map(([f, slot, span]) => ({ key: `seq/${f}`, name: f, shelf: "seq", ...xw(slotAt(0, slot, span)) })),
  ...[["_meta", 0], ["_txn", 1], ["_cv", 2], ["symbol.o", 4], ["symbol.c", 5], ["symbol.k", 6], ["symbol.v", 7]].map(([f, slot]) => ({ key: `table/${f}`, name: f, shelf: "table", ...xw(slotAt(0, slot)) })),
  ...PARTS.flatMap(({ id, forms }) => [
    ...(forms.includes("native") ? NATIVE.map((f) => ({ key: `${id}/${f}`, name: f, shelf: id, group: `${id}-native`, ...xw(slotAt(0, COLUMNS.indexOf(f))) })) : []),
    ...["symbol.k", "symbol.v"].map((f) => ({ key: `${id}/${f}`, name: f, shelf: id, ...xw(slotAt(0, COLUMNS.indexOf(f))) })),
    ...(forms.includes("data") ? [{ key: `${id}/data.parquet`, name: "data.parquet", shelf: id, group: `${id}-data`, ...xw(slotAt(0, 0, 5)) }] : []),
    ...(forms.includes("pm") ? [{ key: `${id}/_pm`, name: "_pm", shelf: id, group: `${id}-pm`, ...xw(slotAt(0, 5)) }] : []),
  ]),
];
function xw([x, w]) { return { x, w }; }
const LOCAL_X = [Math.min(...LOCAL_CARDS.map((c) => c.x)) - 14, Math.max(...LOCAL_CARDS.map((c) => c.x + c.w)) + 14];
const SX = LOCAL_X[1] + GAP + 14 + CARD.w / 2; // the object store's first slot
const STORE_CARDS = [
  { key: "store/_manifest", name: "_manifest", shelf: "table", store: true, ...xw(slotAt(SX, 0)) },
  ...PARTS.filter(({ id }) => id !== "pa").flatMap(({ id }) => [
    { key: `s${id}/data.parquet`, name: "data.parquet", shelf: id, store: true, group: `s${id}`, ...xw(slotAt(SX, 0, 3)) },
    { key: `s${id}/_pm.a`, name: "_pm.a", shelf: id, store: true, group: `s${id}`, ...xw(slotAt(SX, 3)) },
  ]),
];
const STORE_X = [Math.min(...STORE_CARDS.map((c) => c.x)) - 14, Math.max(...STORE_CARDS.map((c) => c.x + c.w)) + 14];
const CARDS = [...LOCAL_CARDS, ...STORE_CARDS];
const fileOf = (key) => CARDS.find((c) => c.key === key);
const GROUPS = [...new Set(CARDS.map((c) => c.group).filter(Boolean))];

export const describe = (key) => {
  const m = key.match(/^wal(\d)\/(.*)$/);
  if (m) return FILES.wal(m[1], m[2]);
  const p = key.match(/^(s?)(p[a\d])\/(.*)$/);
  if (p) {
    const { date } = partOf(p[2]);
    return p[1] ? `…/day=${date.slice(8)}/ · ` + FILES[`store/${p[3]}`] : `${date} · ` + FILES[`partition/${p[3]}`];
  }
  return FILES[key];
};

// How much of each group shows at second s. The late rows scenario starts where the policy's
// pass ends, and a cold copy dims there while its replacement is made. Near a loop's end every
// group eases to where the next loop starts, the same scenario or the other, so nothing jumps.
function groupsAt(s) {
  const native = 1 - smooth((s - T.parquet - T.stage * 0.5) / (T.stage * 0.5));
  const pq = smooth((s - T.parquet) / 0.5);
  const kept = 1 - smooth((s - T.drop) / (T.stage * 0.6));
  const up = smooth((s - T.remote) / 0.5);
  return { "pa-native": 1, "p0-native": 1, "p1-native": native, "p1-pm": pq, "p1-data": pq, "p2-pm": 1, "p2-data": kept, "p3-pm": 1, sp0: up, sp1: 1, sp2: 1, sp3: 1 };
}
export const AFTER_PASS = T.remote + T.stage + 1;
function lateAt(s) {
  const o = { ...groupsAt(AFTER_PASS) };
  for (const l of LATE) if (l.kind !== "sealed") o[`s${l.p}`] = 1 - 0.7 * smooth((s - l.t - LATE_T.stale) / 0.3) * (1 - smooth((s - l.t - LATE_T.back) / 0.3));
  return o;
}
export function opacityAt(s, scenario = "policy", next = scenario) {
  const late = scenario === "late";
  const now = late ? lateAt(s) : groupsAt(s), to = next === "late" ? lateAt(0) : groupsAt(0);
  const back = smooth((s - ((late ? LATE_T.loop : T.loop) - LOOP_FADE)) / LOOP_FADE);
  return Object.fromEntries(GROUPS.map((g) => [g, now[g] + (to[g] - now[g]) * back]));
}

export function makeInternals(k, P) {
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const D = (pts, style) => k.dotsSvg(pts, style);
  const iso = (pt) => k.iso(pt, P);
  const slab = (plan, z, h, style, steps = 2, bevel = 0.3) => S(k.slabOf(plan, z, h, P, steps, Math.min(bevel, h / 3, plan.w / 3)), style);
  const base = (shelf) => ROW_Z[shelf] + TRAY_Z;
  const planOf = (c) => ({ x: c.x, y: -CARD.d / 2, w: c.w, d: CARD.d, r: 0.5 });
  const extent = () => ({ x0: LOCAL_X[0], x1: STORE_X[1], local: LOCAL_X, store: STORE_X });

  // trays: a WAL segment per writer, every other directory one tray per shelf
  const trays = () => {
    const out = [];
    const tray = (cards, z) => {
      if (!cards.length) return;
      const xs = cards.flatMap((c) => [c.x, c.x + c.w]);
      out.push({ x: Math.min(...xs) - 4, y: -6, w: Math.max(...xs) - Math.min(...xs) + 8, d: 12, r: 1.2, z });
    };
    for (let w = 1; w <= WRITERS; w++) tray(LOCAL_CARDS.filter((c) => c.key.startsWith(`wal${w}/`)), ROW_Z.wal);
    for (const sh of SHELVES.slice(1)) tray(LOCAL_CARDS.filter((c) => c.shelf === sh && !c.key.startsWith("wal")), ROW_Z[sh]);
    for (const sh of STORE_SHELVES) tray(STORE_CARDS.filter((c) => c.shelf === sh), ROW_Z[sh]);
    return out;
  };
  // one cabinet: plinth, back, shelves, sides
  function cabinet([x0, x1], shelves, top, blue) {
    let out = "";
    const plinth = { x: x0 - 4, y: SHELF.y - 2, w: x1 - x0 + 8, d: SHELF.d + 4, r: 1.5 };
    out += `<path class="iso-halo" d="${k.haloOf(plinth, -8, 2, P)}"/>`;
    out += S(k.slabOf(plinth, -8, 6, P, 3, 0.6), { tone: "lo", inner: L(k.sideSeam(plinth, -6, P, 3), { tone: "faint" }) });
    out += slab({ x: x0, y: SHELF.y - 1.4, w: x1 - x0, d: 1.4, r: 0.3 }, -2, top + 2, { tone: "lo", crease: "none" }, 2, 0.3);
    const shelf = { x: x0, y: SHELF.y, w: x1 - x0, d: SHELF.d, r: 0.8 };
    for (const sh of shelves) {
      const z = ROW_Z[sh];
      out += S(k.slabOf(shelf, z - SHELF.t, SHELF.t, P, 2, 0.4), blue ? { tone: "blue", crease: "lo", className: "sa-pq" } : { tone: "mid", inner: L(k.sideSeam(shelf, z - 1, P, 2), { tone: "faint" }) });
    }
    for (const x of [x0 - 3, x1]) {
      const side = { x, y: SHELF.y - 1.4, w: 3, d: SHELF.d + 1.4, r: 0.6 };
      out += S(k.slabOf(side, -2, top + 2, P, 2, 0.4), { tone: "mid", inner: L(k.sideSeam(side, top - 2, P, 2), { tone: "faint" }) });
    }
    const lid = { x: x0 - 3, y: SHELF.y - 1.4, w: x1 - x0 + 6, d: SHELF.d + 1.4, r: 0.6 };
    out += S(k.slabOf(lid, top, 2.2, P, 2, 0.4), blue ? { tone: "blue", crease: "lo", className: "sa-pq" } : { tone: "mid", inner: L(k.sideSeam(lid, top + 1.1, P, 2), { tone: "faint" }) });
    return out;
  }
  const TOP = ROW_Z.wal + CARD.h + 12, STORE_TOP = ROW_Z.table + CARD.h + 12;

  function cardSvg(c) {
    const plan = planOf(c);
    const pq = c.store || c.name === "_pm" || c.name === "data.parquet";
    let s = `<g data-file="${c.key}">`;
    s += S(k.slabOf(plan, base(c.shelf), CARD.h, P, 2, 0.4), { tone: pq ? "blue" : "hi", crease: "lo", className: pq ? (c.name.startsWith("_pm") ? "sa-pm" : "sa-pq") : undefined, inner: L(k.sideSeam(plan, base(c.shelf) + FILL_TOP + 0.6, P, 2), { tone: "faint" }) });
    if (c.name === "data.parquet") s += gridSvg(plan, base(c.shelf));
    if (c.key === "seq/_txnlog") s += cellsSvg(plan, base(c.shelf));
    return s + `</g>`;
  }
  // data.parquet's face: its row groups side by side, a chunk per column in each
  function gridSvg(plan, z0) {
    const y = plan.y + plan.d + 0.05;
    let lines = "";
    for (let g = 1; g < ROW_GROUPS; g++) lines += k.segment([plan.x + (g * plan.w) / ROW_GROUPS, y, z0], [plan.x + (g * plan.w) / ROW_GROUPS, y, z0 + FILL_TOP + 0.6], P);
    for (let c = 1; c < 6; c++) { const z = z0 + 0.8 + ((FILL_TOP - 0.8) * c) / 6; lines += k.segment([plan.x, y, z], [plan.x + plan.w, y, z], P); }
    return L(lines, { tone: "lo" });
  }
  // _txnlog's face: a cell per transaction, in the sequencer's order
  const CELLS = ORDER.length;
  const cellPlan = (plan, n) => ({ x: plan.x + 1.2 + (n * (plan.w - 2.4)) / CELLS, w: (plan.w - 2.4) / CELLS - 1 });
  function cellsSvg(plan, z0) {
    let lines = "";
    for (let n = 1; n < CELLS; n++) { const x = cellPlan(plan, n).x - 0.5; lines += k.segment([x, plan.y + plan.d + 0.05, z0], [x, plan.y + plan.d + 0.05, z0 + FILL_TOP + 0.6], P); }
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
  // what a card holds whatever the moment; the cards the cycle fills are left to render()
  const staticFill = (c) => {
    if (!c.store && ["wal", "seq", "table", "pa"].includes(c.shelf)) return "";
    if (c.key === "sp0/data.parquet") return "";
    if (c.key === "p1/_pm" || c.key === "p1/data.parquet") return "";
    if (c.name === "data.parquet") return groupFill(c.key, 1);
    return fillSvg(c.key, c.name.startsWith("_pm") ? 1 : 0.9);
  };

  // The cabinets and every card, with the groups at their opacity for second s.
  function staticSvg(s, scenario = "policy") {
    const o = opacityAt(s, scenario);
    let out = cabinet(LOCAL_X, SHELVES, TOP, false) + cabinet(STORE_X, STORE_SHELVES, STORE_TOP, true);
    for (const t of trays()) out += slab(t, t.z, TRAY_Z, { tone: "lo", crease: "lo" }, 3, 0.4);
    const done = new Set();
    for (const c of CARDS) {
      if (!c.group) { out += cardSvg(c) + staticFill(c); continue; }
      if (done.has(c.group)) continue;
      done.add(c.group);
      const members = CARDS.filter((m) => m.group === c.group);
      out += `<g data-part="${c.group}" opacity="${o[c.group].toFixed(2)}">${members.map((m) => cardSvg(m) + staticFill(m)).join("")}</g>`;
    }
    return out;
  }

  // The words that never change: each shelf's directory at the cabinet's left, the WALs'
  // names, the table's files, and the object store's name above it.
  function labelsSvg(label) {
    const [x0] = LOCAL_X;
    let out = "";
    const left = (sh, a, b) => {
      const pt = [x0 - 3, SHELF.y + SHELF.d, ROW_Z[sh] + 4];
      out += label(pt, a, { anchor: "end", dx: -8, dy: 0 }) + label(pt, b, { anchor: "end", dx: -8, dy: 11, sub: true });
    };
    left("wal", "THREE WRITERS", "a WAL each");
    left("seq", "txn_seq/", "one order");
    left("table", "trades~5/", "the table");
    for (let w = 1; w <= WRITERS; w++) out += label([WAL_X[w - 1] + (WAL_FILES.length * WAL_SLOT) / 2, CARD.d, base("wal") + CARD.h], `wal${w}/0/`, { anchor: "middle", dy: -5 });
    // on the crowded rows every other name sits higher
    const rows = { seq: [], table: [], pa: [] };
    for (const c of LOCAL_CARDS) if (rows[c.shelf] && (c.shelf !== "pa" || COLUMNS.includes(c.name))) rows[c.shelf].push(c);
    for (const sh of ["seq", "table", "pa"]) rows[sh].forEach((c, i) => {
      const high = sh === "pa" ? i % 2 === 1 : sh === "table" && c.name.startsWith("symbol") && i % 2 === 0;
      out += label([c.x + c.w / 2, CARD.d, base(c.shelf) + CARD.h], c.name, { anchor: "middle", dy: high ? -13 : -4, sub: true });
    });
    const mid = (STORE_X[0] + STORE_X[1]) / 2;
    out += label([mid, CARD.d, STORE_TOP + 2.2], "OBJECT STORE", { anchor: "middle", dy: -22 }) + label([mid, CARD.d, STORE_TOP + 2.2], "trades~5/year=2026/month=…/day=…/", { anchor: "middle", dy: -9, sub: true });
    out += label([STORE_CARDS.find((c) => c.key === "store/_manifest").x + CARD.w / 2, CARD.d, base("table") + CARD.h], "_manifest", { anchor: "middle", dy: -5, sub: true });
    return out;
  }
  // The partitions' words change with their stage.
  function partitionLabels(label, s) {
    const [x0] = LOCAL_X;
    const o = opacityAt(s);
    const st = stateAt(s);
    const dir = (id, a, b) => {
      const pt = [x0 - 3, SHELF.y + SHELF.d, ROW_Z[id] + 4];
      return label(pt, a, { anchor: "end", dx: -8, dy: 0 }) + label(pt, b, { anchor: "end", dx: -8, dy: 11, sub: true });
    };
    let out = "";
    out += dir("pa", "2026-11-20.36/", "native · active");
    out += dir("p0", "2026-11-19.33/", st.remote >= 0.5 ? "native · local/cold" : "native · local");
    out += dir("p1", o["p1-pm"] >= 0.5 ? "2026-11-16.37/" : "2026-11-16.30/", o["p1-pm"] >= 0.5 ? "Parquet · local/cold" : "native · local/cold");
    out += dir("p2", "2026-10-19.12/", o["p2-data"] >= 0.5 ? "Parquet · local/cold" : "cold only · sealed");
    out += dir("p3", "2026-10-18.11/", "cold only · sealed");
    for (const c of CARDS) {
      if (!c.group || c.group.endsWith("-native") || o[c.group] < 0.5) continue;
      out += label([c.x + c.w / 2, CARD.d, base(c.shelf) + CARD.h], c.name, { anchor: "middle", dy: -5, sub: true });
    }
    return out;
  }

  const topOf = (key) => { const c = fileOf(key); return [c.x + c.w / 2, 3, base(c.shelf) + CARD.h + 1]; };
  const along = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f + 6 * Math.sin(Math.PI * f), a[2] + (b[2] - a[2]) * f];
  const chip = (pt) => slab({ x: pt[0] - 1.8, y: pt[1] - 1, w: 3.6, d: 2, r: 0.3 }, pt[2], 1.3, { tone: "lit", crease: "lo", lit: true }, 2, 0.2);
  // a read from a sealed partition: from its _pm, over the index, across to the data in the
  // object store
  const readLink = (id) => {
    const pm = fileOf(`${id}/_pm`), data = fileOf(`s${id}/data.parquet`);
    const top = base(id) + CARD.h, over = top + 4.5;
    const a = [pm.x + pm.w / 2, 0, top], b = [data.x + 10, 0, top];
    const d = k.segment(a, [a[0], 0, over], P) + k.segment([a[0], 0, over], [b[0], 0, over], P) + k.segment([b[0], 0, over], b, P);
    return L(d, { tone: "hi" }) + D([iso(a), iso(b)], { size: 0.7, tone: "hi" });
  };

  // The late rows scenario: one late commit per writer, into a native, a Parquet and a sealed
  // partition, each applied from its own WAL in the sequencer's order.
  function renderLate(s, label, next) {
    let fills = "", flying = "", tags = "";
    const committed = LATE_ORDER.filter((c) => s >= c.t + T.fly);
    for (let w = 1; w <= WRITERS; w++) { const c = committed.filter((l) => l.w === w).length; for (const f of WAL_FILES) fills += fillSvg(`wal${w}/${f}`, 0.15 + c * 0.35); }
    const log = fileOf("seq/_txnlog");
    committed.forEach((l, j) => {
      const c = cellPlan(planOf(log), j);
      fills += slab({ x: c.x, y: CARD.d / 2, w: c.w, d: 0.5, r: 0.2 }, base("seq") + 0.8, FILL_TOP - 1, FILL, 2, 0.15);
      tags += label([c.x + c.w / 2, CARD.d, base("seq") + 6], `w${l.w}`, { anchor: "middle", dy: 3, sub: true });
    });
    fills += fillSvg("table/_txn", 0.9);
    for (const f of ["symbol.o", "symbol.c", "symbol.k", "symbol.v"]) fills += fillSvg(`table/${f}`, 0.6);
    const onTime = LATE_ORDER.filter((c) => !c.late && s >= c.at + T.fly).length;
    for (const f of COLUMNS) fills += fillSvg(`pa/${f}`, 0.5 + onTime * 0.13);
    for (const c of LATE_ORDER) if (!c.late) {
      const fc = (s - c.t) / T.fly, fa = (s - c.at) / T.fly;
      if (fc >= 0 && fc < 1) {
        const tray = topOf(`wal${c.w}/ts.d`);
        flying += chip(along([tray[0] - 30, tray[1] + 18, tray[2] + 10], tray, smooth(fc))) + chip(along(topOf(`wal${c.w}/_event`), topOf("seq/_txnlog"), smooth(fc)));
      }
      if (fa >= 0 && fa < 1) for (const col of ["ts.d", "symbol.d", "price.d", "venue.d"]) flying += chip(along(topOf(`wal${c.w}/${col}`), topOf(`pa/${col}`), smooth(fa)));
    }
    fills += groupFill("p1/data.parquet", 1) + fillSvg("p1/_pm", 1) + groupFill("sp0/data.parquet", 1) + fillSvg("store/_manifest", 0.7);
    const flash = (key, f) => { const c = fileOf(key); return `<g opacity="${(0.6 * f).toFixed(2)}">${slab(planOf(c), base(c.shelf), CARD.h, FILL, 2, 0.4)}</g>`; };
    for (const l of LATE) {
      const fc = (s - l.t) / LATE_T.fly;
      if (fc >= 0 && fc < 1) {
        const tray = topOf(`wal${l.w}/ts.d`);
        flying += chip(along([tray[0] - 30, tray[1] + 18, tray[2] + 10], tray, smooth(fc)));
        flying += chip(along(topOf(`wal${l.w}/_event`), topOf("seq/_txnlog"), smooth(fc)));
      }
      const a = l.t + LATE_T.apply, fa = (s - a) / LATE_T.fly;
      const targets = l.kind === "native" ? ["ts.d", "symbol.d", "price.d", "venue.d"].map((c) => `p0/${c}`) : l.kind === "parquet" ? [`${l.p}/data.parquet`] : [`${l.p}/_pm`];
      if (fa >= 0 && fa < 1) for (const [i, col] of ["ts.d", "symbol.d", "price.d", "venue.d"].entries()) flying += chip(along(topOf(`wal${l.w}/${col}`), topOf(targets[i % targets.length]), smooth(fa)));
      const landed = s - a - LATE_T.fly;
      if (l.kind === "sealed") {
        // skipped: the row rises off the sealed partition and fades
        if (landed >= 0 && landed < 1.2) {
          const top = topOf(targets[0]);
          flying += `<g opacity="${(1 - smooth(landed / 1.2)).toFixed(2)}">${chip([top[0], top[1], top[2] + 12 * smooth(landed / 1.2)])}</g>`;
        }
        if (landed >= 0 && landed < 2.2) {
          // over the empty slots left of _pm, clear of the read line
          const pm = fileOf(`${l.p}/_pm`);
          tags += label([pm.x - SLOT, CARD.d, base(l.p) + CARD.h * 0.6], "row skipped", { anchor: "middle", dy: -5, sub: true });
        }
      } else {
        if (landed >= 0 && landed < 0.9) for (const key of targets) flying += flash(key, 1 - smooth(landed / 0.9));
        const fu = (s - l.t - LATE_T.upload) / 0.7;
        if (fu >= 0 && fu < 1) for (const key of targets.slice(0, 3)) flying += chip(along(topOf(key), topOf(`s${l.p}/data.parquet`), smooth(fu)));
      }
    }
    const links = readLink("p3") + readLink("p2");
    return { fills, flying, links, tags: tags + partitionLabels(label, AFTER_PASS), opacity: opacityAt(s, "late", next), st: stateAt(AFTER_PASS) };
  }

  function render(s, label, scenario = "policy", next = scenario) {
    if (scenario === "late") return renderLate(s, label, next);
    const st = stateAt(s);
    const n = ORDER.length;
    let fills = "", flying = "", tags = "";
    // each writer's segment fills with its own commits
    for (let w = 1; w <= WRITERS; w++) for (const f of WAL_FILES) fills += fillSvg(`wal${w}/${f}`, (st.perWriter[w - 1] / 2) * 0.9);
    // _txnlog: a lit cell per committed transaction, tagged with its writer
    const log = fileOf("seq/_txnlog");
    for (let j = 0; j < st.committed; j++) {
      const c = cellPlan(planOf(log), j);
      fills += slab({ x: c.x, y: CARD.d / 2, w: c.w, d: 0.5, r: 0.2 }, base("seq") + 0.8, FILL_TOP - 1, FILL, 2, 0.15);
      tags += label([c.x + c.w / 2, CARD.d, base("seq") + 6], `w${ORDER[j].w}`, { anchor: "middle", dy: 3, sub: true });
    }
    fills += fillSvg("table/_txn", 0.3 + (0.6 * st.applied) / n);
    for (const f of ["symbol.o", "symbol.c", "symbol.k", "symbol.v"]) fills += fillSvg(`table/${f}`, 0.6);
    // today's partition fills as apply goes; 2026-11-16 binds into Parquet; 2026-11-19 goes up
    for (const f of COLUMNS) fills += fillSvg(`pa/${f}`, 0.1 + st.applied * 0.13);
    fills += groupFill("p1/data.parquet", st.parquet) + fillSvg("p1/_pm", st.parquet);
    fills += groupFill("sp0/data.parquet", st.remote) + fillSvg("store/_manifest", 0.5 + 0.2 * st.remote);
    // flights: commits into each writer's segment and on to the sequencer; applies from the
    // right segment, in order; the rewrite in place; the upload across to the object store
    ORDER.forEach((c) => {
      const f = (s - c.t) / T.fly;
      if (f >= 0 && f < 1) {
        const tray = topOf(`wal${c.w}/ts.d`);
        flying += chip(along([tray[0] - 30, tray[1] + 18, tray[2] + 10], tray, smooth(f)));
        flying += chip(along(topOf(`wal${c.w}/_event`), topOf("seq/_txnlog"), smooth(f)));
      }
    });
    ORDER.forEach((c, j) => {
      const f = (s - applyAt(j)) / T.fly;
      if (f >= 0 && f < 1) for (const col of ["ts.d", "symbol.d", "price.d", "venue.d"]) flying += chip(along(topOf(`wal${c.w}/${col}`), topOf(`pa/${col}`), smooth(f)));
    });
    const pq = (s - T.parquet) / (T.stage * 0.7);
    if (pq >= 0 && pq < 1) for (const col of ["ts.d", "symbol.d", "price.d", "venue.i"]) flying += chip(along(topOf(`p1/${col}`), topOf("p1/data.parquet"), smooth(pq)));
    const up = (s - T.remote) / (T.stage * 0.7);
    if (up >= 0 && up < 1) for (const col of ["ts.d", "price.d", "venue.d"]) flying += chip(along(topOf(`p0/${col}`), topOf("sp0/data.parquet"), smooth(up)));
    const o = opacityAt(s, "policy", next);
    const links = readLink("p3") + `<g opacity="${(1 - o["p2-data"]).toFixed(2)}">${readLink("p2")}</g>`;
    return { fills, flying, links, tags: tags + partitionLabels(label, s), opacity: o, st };
  }
  return { staticSvg, labelsSvg, render, extent, describe, groups: GROUPS };
}
