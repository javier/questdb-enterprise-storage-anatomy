// Geometry shared by the build (rest pose) and the live code (every frame).
// `k` is the iso kit, `G` the lathe kit, `P` the projection.
//
// The x axis is partition age on a log scale, like a slide rule: the write head of every
// instance stands at X_NOW, and a moment that is `age` partitions old sits at
// X_NOW - S * ln(1 + age / a0). That fits TO REMOTE 1 HOUR and DROP LOCAL 1 MONTH on
// one bench. Instances are benches side by side along y; the object store is one deck
// behind them all, with the cold Parquet copies on the left and the replication bay,
// where WAL segments pass from the primary to the replicas, on the right.

import { PRESETS, axisEnd, nominal } from "./model.mjs";

export const X_NOW = 156;
export const X_END = -128;
export const LANE_Y = [44, 0, -44]; // primary, replica 1, replica 2 (manager)
export const BENCH = { x: -134, w: 330, d: 32, r: 3, t: 5, foot: 5 };
export const HEAD = { x: 158, w: 36, d: 28, h: 16 };
export const FLOOR = -BENCH.t - BENCH.foot;
export const DECK = { x: -138, y: -104, w: 348, d: 30, r: 2, z: 47, t: 3 };
export const DECK_TOP = DECK.z + DECK.t;
export const BAY_X = 160; // the replication bay starts here
export const STORE_Y = DECK.y + DECK.d / 2;
export const ROD_Z = DECK_TOP + 2.2;
export const FLY_Z = 64;
export const FEED = { y: LANE_Y[0] - 5, x0: HEAD.x + HEAD.w, x1: HEAD.x + HEAD.w + 30, z: 9 };
export const RULER = { x: BENCH.x + 4, y: LANE_Y[0] + BENCH.d / 2 + 4, w: X_NOW - BENCH.x + 2, d: 15, r: 1 };

// The slide-rule axis for a preset.
export function axisOf(g) {
  const a0 = PRESETS[g].a0;
  const S = (X_NOW - X_END) / Math.log(1 + axisEnd(g) / a0);
  const xOfAge = (age) => X_NOW - S * Math.log(1 + Math.max(0, age) / a0);
  return { S, xOfAge, gates: nominal(g).map(xOfAge) };
}

// A block's cross-section, back (toward the store) to front: the symbol index .k/.v,
// then one bar per column file: ts 8, symbol key 4, price 8, amount 8, venue data
// about 10 (average string) and venue aux 16 bytes per row.
const INDEX = [2, 3];
const DATA = [8, 4, 8, 8, 10, 16];
const HALF = 12;
const GAP = 0.6;
const PER_BYTE = (2 * HALF - GAP * (INDEX.length + DATA.length - 1)) / (INDEX.reduce((a, b) => a + b, 0) + DATA.reduce((a, b) => a + b, 0));
const PALLET = 1.2;
const BAR_H = 8;
const INDEX_H = 2.4;
const RATIO = 0.45;
export const POST_Y = 4.5;
export const POST_TOP = PALLET + 10;
const DETAIL = 9; // below this length a block drops its fine detail
export const ROW_GROUPS = 4; // row groups per Parquet partition, as drawn
// Parquet is the one coloured thing: local Parquet, _pm and every copy in the store.
const PQ = { tone: "blue", crease: "lo", className: "sa-pq" };
export const PQ_CSS =
  ".sa-fig .sa-pq>.iso-top{fill:color-mix(in srgb,var(--anatomy-blue) 30%,var(--anatomy-top))}" +
  ".sa-fig .sa-pq>.iso-shade{fill:color-mix(in srgb,var(--anatomy-blue) 18%,var(--anatomy-shade-2))}" +
  ".sa-fig .sa-pq>.iso-fill{fill:color-mix(in srgb,var(--anatomy-blue) 18%,var(--anatomy-face))}" +
  // _pm, the Parquet metadata, is solid blue so it reads apart from the data it describes
  ".sa-fig .sa-pm>.iso-top{fill:color-mix(in srgb,var(--anatomy-blue) 85%,var(--anatomy-top))}" +
  ".sa-fig .sa-pm>.iso-shade{fill:color-mix(in srgb,var(--anatomy-blue) 65%,var(--anatomy-shade-2))}" +
  ".sa-fig .sa-pm>.iso-fill{fill:color-mix(in srgb,var(--anatomy-blue) 65%,var(--anatomy-face))}" +
  ".sa-fig .sa-read>.iso-top{fill:var(--anatomy-lit)}.sa-fig .sa-read>.iso-shade,.sa-fig .sa-read>.iso-fill{fill:color-mix(in srgb,var(--anatomy-lit) 60%,var(--anatomy-face))}" +
  ".sa-fig .sa-label{font:600 9.5px/1 var(--anatomy-mono);letter-spacing:.03em;fill:var(--anatomy-strong);stroke:var(--anatomy-card);stroke-width:3.4px;stroke-linejoin:round;paint-order:stroke;pointer-events:none}" +
  ".sa-fig .sa-label[data-sub]{font-weight:400;font-size:8.6px;fill:var(--anatomy-text)}";

export function makeParts(k, G, P) {
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const D = (points, style) => k.dotsSvg(points, style);
  const at = (point) => k.iso(point, P);
  const slab = (plan, z, h, style, steps = 2, bevel = 0.25) => S(k.slabOf(plan, z, h, P, steps, Math.max(0.05, Math.min(bevel, h / 3, plan.w / 3))), style);
  const text = (m, s, opts) => k.faceTextSvg(m, s, opts);

  // One partition on one instance, built with its older end at x = 0.
  // m: Parquet 0..1. sealed, evict: 0..1. open: the active partition (runs into the head).
  // cols: optional six flags, one per column-file bar, so a query lights only what it reads.
  function blockSvg(len, { m = 0, sealed = 0, evict = 0, lit = false, open = false, cols = null } = {}) {
    const out = [];
    const fine = len >= DETAIL;
    const tone = { tone: "hi", crease: "lo", lit };
    const pq = { ...PQ, lit };
    const end = Math.min(0.8, len * 0.08);
    out.push(slab({ x: 0, y: -HALF - 0.6, w: len, d: 2 * HALF + 1.2, r: Math.min(0.6, len / 4) }, 0, PALLET, { tone: "lo", crease: "none" }));
    // _pm stays visible at any width: it is all that is left locally after DROP LOCAL
    const pmW = fine ? 1.4 * m : m >= 1 ? Math.min(1.2, len * 0.35) : 0;
    const x0 = end, x1 = open ? len : len - end - (pmW ? pmW + 0.4 : 0);
    // _pm, the Parquet metadata, stands at the newer end once the partition is Parquet
    const pm = () => {
      if (pmW <= 0.02) return "";
      const pmH = (BAR_H * RATIO + 1.2) * m;
      const plan = { x: len - end - pmW, y: -HALF, w: pmW, d: 2 * HALF, r: Math.min(0.2, pmW / 3) };
      let s = slab(plan, PALLET, pmH, { ...pq, className: "sa-pm" });
      if (sealed > 0 && fine) {
        s += slab({ x: plan.x - 0.5, y: -2.2, w: pmW + 1, d: 4.4, r: 0.4 }, PALLET + pmH, 1.2 * sealed, { tone: "mid", crease: "lo", lit });
        s += D([at([plan.x + pmW / 2, 0, PALLET + pmH + 1.2 * sealed])], { size: 0.45, tone: lit ? "hi" : "mid" });
      }
      return s;
    };
    if (x1 - x0 < 0.3) return out.join("") + pm();
    // the symbol index stays on every instance, through every stage
    const idxD = INDEX.reduce((a, b) => a + b * PER_BYTE, 0) + GAP;
    if (fine) {
      let y = -HALF;
      for (const bytes of INDEX) { out.push(slab({ x: x0, y, w: x1 - x0, d: bytes * PER_BYTE, r: 0.3 }, PALLET, INDEX_H, tone)); y += bytes * PER_BYTE + GAP; }
    } else out.push(slab({ x: x0, y: -HALF, w: x1 - x0, d: idxD - GAP, r: 0.2 }, PALLET, INDEX_H, tone));
    const dataY0 = -HALF + idxD;
    const h = BAR_H * (1 - (1 - RATIO) * m);
    let body = "";
    if (m < 1 && fine) {
      // native: one bar per column file, the gaps closing as it binds into Parquet
      const gap = GAP * (1 - m);
      let y = dataY0;
      DATA.forEach((bytes, i) => {
        const w = bytes * PER_BYTE + ((GAP - gap) * (DATA.length - 1)) / DATA.length;
        const on = lit && (!cols || cols[i]);
        body += slab({ x: x0, y, w: x1 - x0, d: w, r: 0.3 }, PALLET, h, { ...(m >= 0.5 ? pq : tone), lit: on });
        y += w + gap;
      });
    } else {
      const plan = { x: x0, y: dataY0, w: x1 - x0, d: HALF - dataY0, r: Math.min(0.4, (x1 - x0) / 4) };
      const top = PALLET + h;
      if (m < 1) {
        // a thin native block: the column files show as lines along its top
        let seams = "";
        let yy = dataY0;
        DATA.slice(0, -1).forEach((bytes) => { yy += bytes * PER_BYTE + GAP; seams += k.lineOnTop([x0 + 0.2, yy], [x1 - 0.2, yy], top, P); });
        body += S(k.slabOf(plan, PALLET, h, P, 2, 0.15), { ...tone, inner: L(seams, { tone: "lo" }) });
      } else {
        let groups = "";
        if (fine) for (let n = 1; n < 4; n++) groups += k.lineOnTop([x0 + ((x1 - x0) * n) / 4, dataY0 + 0.6], [x0 + ((x1 - x0) * n) / 4, HALF - 0.6], top, P);
        body += S(k.slabOf(plan, PALLET, h, P, 2, 0.2), { ...pq, inner: groups ? L(groups, { tone: "blue" }) : "" });
      }
    }
    if (evict < 1) out.push(evict > 0 ? `<g opacity="${(1 - evict).toFixed(3)}">${body}</g>` : body);
    else if (fine) out.push(L(k.planOutline({ x: x0, y: dataY0, w: x1 - x0, d: HALF - dataY0, r: 0.4 }, PALLET, P, 2), { tone: "lo" }));
    out.push(pm());
    return out.join("");
  }

  // The Parquet copy in the object store: data.parquet with its _pm, on a pad.
  function copySvg(len, z0, lit, pad = true) {
    const out = [];
    const tone = { ...PQ, lit };
    const fine = len >= DETAIL;
    const end = Math.min(0.8, len * 0.08);
    if (pad) out.push(slab({ x: 0, y: -HALF + 3, w: len, d: 2 * HALF - 3, r: Math.min(0.6, len / 4) }, z0, 0.8, { tone: "lo", crease: "none" }));
    const zb = z0 + (pad ? 0.8 : 0);
    const x0 = end, x1 = len - end - (fine ? 1.8 : 0);
    if (x1 - x0 < 0.3) return out.join("");
    const y0 = -HALF + 3.6;
    const h = BAR_H * RATIO;
    let groups = "";
    if (fine) for (let n = 1; n < 4; n++) groups += k.lineOnTop([x0 + ((x1 - x0) * n) / 4, y0 + 0.6], [x0 + ((x1 - x0) * n) / 4, HALF - 0.6], zb + h, P);
    out.push(S(k.slabOf({ x: x0, y: y0, w: x1 - x0, d: HALF - y0, r: Math.min(0.4, (x1 - x0) / 4) }, zb, h, P, 2, 0.2), { ...tone, inner: groups ? L(groups, { tone: "blue" }) : "" }));
    if (fine) out.push(slab({ x: len - end - 1.4, y: y0, w: 1.4, d: HALF - y0, r: 0.2 }, zb, h + 1.2, { ...tone, className: "sa-pm" }));
    return out.join("");
  }

  // A cold partition reads its data from the object store: a rod from the copy forward
  // over the benches, with a drop to each instance that has dropped its local data.
  function rodSvg(cx, lanes, lit) {
    if (!lanes.length) return "";
    const front = Math.max(...lanes.map((i) => LANE_Y[i])) + POST_Y;
    let drops = "", posts = "";
    for (const i of lanes) {
      drops += k.segment([cx, LANE_Y[i] + POST_Y, ROD_Z], [cx, LANE_Y[i] + POST_Y, POST_TOP], P);
      posts += S(k.cylinder(cx, LANE_Y[i] + POST_Y, 0.9, PALLET, POST_TOP - PALLET, P, 14), { tone: "mid", lit });
    }
    return posts + L(drops, { tone: lit ? "lit" : "lo" }) + L(k.segment([cx, STORE_Y + HALF, ROD_Z], [cx, front, ROD_Z], P), { tone: lit ? "lit" : "mid" }) +
      D([at([cx, STORE_Y + HALF, ROD_Z]), ...lanes.flatMap((i) => [at([cx, LANE_Y[i] + POST_Y, ROD_Z]), at([cx, LANE_Y[i] + POST_Y, POST_TOP])])], { size: 0.55, tone: lit ? "hi" : "mid" });
  }

  const ease = (x) => x * x * (3 - 2 * x);
  // up, across, down: the path anything takes between a bench and the deck
  function flight(a, b, s) {
    if (s < 0.3) return [a[0], a[1], a[2] + (FLY_Z - a[2]) * ease(s / 0.3)];
    if (s < 0.7) { const t = ease((s - 0.3) / 0.4); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, FLY_Z]; }
    return [b[0], b[1], FLY_Z + (b[2] - FLY_Z) * ease((s - 0.7) / 0.3)];
  }

  // A WAL segment: a small cartridge, far smaller than any partition.
  function chipSvg([x, y, z], lit) {
    return slab({ x: x - 1.8, y: y - 1.4, w: 3.6, d: 2.8, r: 0.4 }, z, 1.6, { tone: "hi", crease: "lo", lit }, 2, 0.2);
  }
  // Rows from clients riding the duct into the primary: small blocks, always moving.
  function feedSvg(u) {
    const { y, x0, x1, z } = FEED;
    let out = "";
    for (let j = 0; j < 5; j++) {
      const s = (((u * 1.6 + j / 5) % 1) + 1) % 1;
      const x = x1 - 1.6 - s * (x1 - x0 - 3.2);
      const fade = s > 0.88 ? (1 - s) / 0.12 : s < 0.1 ? s / 0.1 : 1;
      out += `<g opacity="${fade.toFixed(2)}">${slab({ x: x - 0.9, y: y - 1.1, w: 1.8, d: 2.2, r: 0.3 }, z, 1.3, { tone: "hi", crease: "lo" }, 2, 0.2)}</g>`;
    }
    return out;
  }
  const PORT = (i) => [HEAD.x + 29, LANE_Y[i] - 7, HEAD.h + 0.6];
  const baySlot = (n) => [DECK.x + DECK.w - 5 - n * 5, STORE_Y + 2, DECK_TOP];

  // The clock on the primary: one turn of the hand per partition.
  const CLOCK = { x: 185, y: LANE_Y[0] + 6, r: 6, z: HEAD.h };
  function dialSvg(ticksPerTurn) {
    const { x, y, r, z } = CLOCK;
    const out = [];
    out.push(S(k.cylinder(x, y, r + 1.3, z, 1, P, 40), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, r, z + 1, 1.6, P, 48, 0.4), { tone: "hi", crease: "lo" }));
    out.push(L(k.ring(x, y, r - 0.9, z + 2.6, P, 48), { tone: "lo" }));
    const every = ticksPerTurn % 4 === 0 ? ticksPerTurn / 4 : ticksPerTurn;
    const ticks = k.radialTicks(x, y, r - 1, ticksPerTurn, every, z + 2.6, [0.7, 1.6], P);
    out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
    return out.join("");
  }
  function handPath(fraction) {
    const a = fraction * Math.PI * 2;
    const { x, y, r, z } = CLOCK;
    return k.lineOnTop([x - Math.sin(a) * 1.2, y + Math.cos(a) * 1.2], [x + Math.sin(a) * (r - 2), y - Math.cos(a) * (r - 2)], z + 2.7, P);
  }
  const hubSvg = () => D([at([CLOCK.x, CLOCK.y, CLOCK.z + 2.7])], { size: 0.6, tone: "hi" });

  // The lamp on each head lights while that instance's policy check does work.
  const LAMP = (i) => ({ x: HEAD.x + 22, y: LANE_Y[i] - 9.5 });
  function lampSvg(i, glow) {
    const { x, y } = LAMP(i);
    return S(k.cylinder(x, y, 1.7, HEAD.h, 1.6, P, 20), { tone: glow > 0.05 ? "hi" : "mid", lit: glow > 0.05 }) + D([at([x, y, HEAD.h + 1.6])], { size: 0.5 + glow * 0.5, tone: glow > 0.05 ? "hi" : "lo" });
  }

  // The marks on each bench for a preset: a line across, a stop at the back, a stop at the
  // front, and the stage engraved on the front margin, ending at the line.
  // only: which stages to mark (indices into the policy), so a figure can show just some
  function marksBack(i, g, only = [0, 1, 2]) {
    const gates = only.map((n) => axisOf(g).gates[n]);
    const y0 = LANE_Y[i] - BENCH.d / 2, y1 = y0 + BENCH.d;
    let out = L(gates.map((x) => k.lineOnTop([x, y0 + 2.2], [x, y1 - 2.2], 0, P)).join(""), { tone: "mid" });
    for (const x of gates) out += slab({ x: x - 1.4, y: y0 + 0.6, w: 2.8, d: 1.8, r: 0.4 }, 0, 2, { tone: "hi", crease: "lo" }, 2, 0.3);
    return out;
  }
  function marksFront(i, g, only = [0, 1, 2]) {
    const gates = only.map((n) => axisOf(g).gates[n]);
    const y1 = LANE_Y[i] + BENCH.d / 2;
    return gates.map((x) => slab({ x: x - 1.4, y: y1 - 2.4, w: 2.8, d: 1.8, r: 0.4 }, 0, 2, { tone: "hi", crease: "lo" }, 2, 0.3)).join("");
  }

  // The ruler on the floor in front: a tick per partition boundary, a stop and the stage
  // with its TTL at each mark, and what the partition is between the marks.
  function rulerSvg(g, only = [0, 1, 2]) {
    const { xOfAge } = axisOf(g);
    const gates = only.map((n) => axisOf(g).gates[n]);
    const out = [];
    const R = RULER, z = FLOOR + 0.8;
    out.push(slab(R, FLOOR, 0.8, { tone: "lo", crease: "none" }, 3));
    const minor = [];
    let last = Infinity;
    for (let n = 1; n <= Math.ceil(axisEnd(g)); n++) {
      const x = xOfAge(n);
      if (last - x < 1.1) continue;
      minor.push(k.lineOnTop([x, R.y + 0.8], [x, R.y + 2.6], z, P));
      last = x;
    }
    out.push(L(minor.join(""), { tone: "lo" }));
    out.push(L(gates.map((x) => k.lineOnTop([x, R.y + 0.8], [x, R.y + 5.2], z, P)).join(""), { tone: "hi" }));
    out.push(D([at([X_NOW, R.y + 1.6, z])], { size: 0.6, tone: "hi" }));
    out.push(L(gates.map((x) => k.lineOnTop([x, R.y + 5.2], [x, R.y + R.d - 1.2], z, P)).join(""), { tone: "mid" }));
    out.push(D(gates.map((x) => at([x, R.y + R.d - 1.2, z])), { size: 0.6, tone: "hi" }));
    return out.join("");
  }

  // Words stay upright and screen-sized, with a halo, so they read at any theme: a
  // label is anchored to a world point and offset in screen px.
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  function label(pt, s, { anchor = "middle", dx = 0, dy = 0, sub = false } = {}) {
    const [x, y] = at(pt);
    return `<text class="sa-label"${sub ? ' data-sub=""' : ""} x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">${esc(s)}</text>`;
  }
  // The labels that depend on the policy: each mark with its TTL, what the local copy is
  // between the marks, and where the Parquet copies begin on the deck.
  // uploader: who puts the Parquet partitions in the object store, for the deck caption
  // deck: whether to label the Parquet partitions on the deck (a figure with its own deck
  // labels leaves it out)
  function labelsSvg(g, { uploader = "uploaded once, only by replica 2", deck = true } = {}) {
    const { gates } = axisOf(g);
    const R = RULER, z = FLOOR;
    const out = [];
    // Each mark gets its name and what happens there, centred under its tick. The ruler
    // falls to the right, so neighbouring marks stack rather than collide.
    const what = [
      ["Parquet partition to the object store", "local copy stays native"],
      ["local copy becomes Parquet"],
      ["local keeps metadata only"],
    ];
    // Laid out from the heads leftwards: each label keeps clear of the heads and of the
    // label before it, sliding left along the ruler; a slid label gets a leader to its mark.
    const GAP = 56;
    let limit = X_NOW - GAP;
    const leaders = [], pins = [];
    PRESETS[g].stages.forEach(([s, , short], n) => {
      const x = Math.min(gates[n], limit);
      limit = x - GAP;
      if (gates[n] - x > 2) {
        leaders.push(k.lineOnTop([gates[n], R.y + R.d - 1.2], [x, R.y + R.d - 1.2], z + 0.8, P));
        pins.push(at([x, R.y + R.d - 1.2, z + 0.8]));
      }
      const pt = [x, R.y + R.d, z];
      out.push(label(pt, s + " " + short, { dy: 13 }));
      what[n].forEach((line, j) => out.push(label(pt, line, { dy: 24 + j * 10, sub: true })));
    });
    if (leaders.length) out.unshift(L(leaders.join(""), { tone: "mid" }) + D(pins, { size: 0.6, tone: "hi" }));
    if (!deck) return out.join("");
    const cold = (X_END + gates[0]) / 2;
    out.push(label([cold, DECK.y + DECK.d, DECK.z], "PARQUET PARTITIONS", { dy: 13 }));
    out.push(label([cold, DECK.y + DECK.d, DECK.z], uploader, { dy: 25, sub: true }));
    return out.join("");
  }

  // What a query reads from one partition, drawn on top of it in the partition's own frame.
  // Native: the stretch of each selected column file it scans. Parquet, local or in the
  // object store: the column chunks of every row group that overlaps the time range, which
  // the _pm metadata maps to byte ranges inside data.parquet. f0..f1 is the queried part of
  // the partition's time span (0 = its start); bars flags the six column-file bars.
  function readSvg(len, { form, f0 = 0, f1 = 1, bars, open = false, z0 = 0 }) {
    const style = { tone: "lit", crease: "lo", lit: true, className: "sa-read" };
    const end = Math.min(0.8, len * 0.08);
    const idxD = INDEX.reduce((a, b) => a + b * PER_BYTE, 0) + GAP;
    const out = [];
    const cell = (xa, xb, ya, yb, z) => {
      if (xb - xa < 0.12 || yb - ya < 0.2) return;
      out.push(slab({ x: xa, y: ya, w: xb - xa, d: yb - ya, r: Math.min(0.25, (xb - xa) / 3) }, z, 0.8, style, 2, 0.15));
    };
    if (form === "native") {
      const x0 = end, x1 = open ? len : len - end;
      const xa = x0 + (x1 - x0) * f0, xb = x0 + (x1 - x0) * f1;
      let y = -HALF + idxD;
      DATA.forEach((bytes, i) => {
        const w = bytes * PER_BYTE;
        if (bars[i]) cell(xa + 0.2, xb - 0.2, y + 0.15, y + w - 0.15, PALLET + BAR_H);
        y += w + GAP;
      });
      return out.join("");
    }
    const remote = form === "copy";
    const fine = len >= DETAIL;
    const x0 = end, x1 = len - end - (remote ? (fine ? 1.8 : 0) : fine ? 1.8 : Math.min(1.2, len * 0.35) + 0.4);
    const y0 = remote ? -HALF + 3.6 : -HALF + idxD;
    const scale = (HALF - y0) / DATA.reduce((a, b) => a + b * PER_BYTE, 0);
    const top = remote ? z0 + 0.8 + BAR_H * RATIO : PALLET + BAR_H * RATIO;
    // the row groups that overlap the range; on a narrow partition they merge into one cell
    const hit = [];
    for (let g = 0; g < ROW_GROUPS; g++) if ((g + 1) / ROW_GROUPS > f0 && g / ROW_GROUPS < f1) hit.push(g);
    if (!hit.length) return "";
    const per = (x1 - x0) / ROW_GROUPS;
    const spans = per >= 1.6 ? hit.map((g) => [g, g + 1]) : [[hit[0], hit[hit.length - 1] + 1]];
    const inset = Math.min(0.35, per * 0.15);
    for (const [g0, g1] of spans) {
      const xa = x0 + per * g0 + inset, xb = x0 + per * g1 - inset;
      let y = y0;
      DATA.forEach((bytes, i) => {
        const w = bytes * PER_BYTE * scale;
        if (bars[i]) cell(xa, xb, y + 0.2, y + w - 0.2, top);
        y += w;
      });
    }
    return out.join("");
  }

  // The tiers along the ruler, for figures about reading: a query's read path changes at
  // TO PARQUET (native to Parquet) and at DROP LOCAL (local disk to cold storage), not at
  // TO REMOTE: an uploaded partition is in cold storage but still read from local disk.
  function tiersSvg(g) {
    const { gates } = axisOf(g);
    const R = RULER, z = FLOOR;
    const zones = [["NATIVE", gates[1], X_NOW], ["PARQUET", gates[2], gates[1]], ["FROM COLD STORAGE", R.x, gates[2]]];
    return zones.map(([s, a, b]) => label([(a + b) / 2, R.y + R.d, z], s, { dy: 13 })).join("");
  }

  return { blockSvg, copySvg, readSvg, rodSvg, flight, chipSvg, feedSvg, PORT, baySlot, dialSvg, handPath, hubSvg, lampSvg, marksBack, marksFront, rulerSvg, labelsSvg, tiersSvg, label, CLOCK, slab };
}

export const BLOCK = { HALF, PALLET, BAR_H };
