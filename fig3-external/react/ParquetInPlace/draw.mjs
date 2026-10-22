// Fig 5's moving parts at time u. QuestDB reads as in Fig 4 (that figure's renderer draws
// it). External engines stand on the far side of the object store, on a shelf behind the
// deck at the deck's own height: QuestDB in front, cold storage in the middle, the other
// engines beyond. In external mode all of them read at once, as they can in real life: the
// chunks light on the deck, and a rod runs back off the deck to every terminal.

import { BLOCK, DECK, DECK_TOP, FLOOR, ROD_Z, STORE_Y, X_END, X_NOW, axisOf } from "./fig1/parts.mjs";
import { C, GRAIN, barsOf, columnRuns, groupsOf, rangeOf, spanOf } from "./fig2/query.mjs";
import { ENGINES, inColdStorage } from "./external.mjs";

// the shelf behind the deck, clear of the deck's sign board, and a terminal per engine
export const SHELF = { x: 26, y: DECK.y - 36, w: DECK.x + DECK.w - 26, d: 24, r: 2, z: DECK.z, t: DECK.t };
const SHELF_TOP = SHELF.z + SHELF.t;
const TERM = { w: 26, d: 15, h: 11 };
export const terminalAt = (i) => ({ x: SHELF.x + 6 + i * ((SHELF.w - 12 - TERM.w) / (ENGINES.length - 1)), y: SHELF.y + 3, ...TERM });
const AISLE_Y = (DECK.y + SHELF.y + SHELF.d) / 2; // between the deck and the shelf

export function makeExternal(k, P, parts, render2, render1) {
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const D = (pts, style) => k.dotsSvg(pts, style);
  const at = (pt) => k.iso(pt, P);
  const slab = (plan, z, h, style, steps = 2, bevel = 0.3) => S(k.slabOf(plan, z, h, P, steps, Math.min(bevel, h / 3)), style);
  const { gates } = axisOf(GRAIN);

  // The shelf on its posts.
  function shelfSvg() {
    const out = [`<path class="iso-halo" d="${k.haloOf(SHELF, FLOOR, 2, P)}"/>`];
    const xs = [SHELF.x + 5, SHELF.x + SHELF.w / 2, SHELF.x + SHELF.w - 5];
    for (const y of [SHELF.y + 3, SHELF.y + SHELF.d - 3]) for (const x of xs) {
      out.push(S(k.slabOf({ x: x - 3.5, y: y - 3.5, w: 7, d: 7, r: 1 }, FLOOR, 1, P, 2), { tone: "lo" }));
      const post = { x: x - 1.6, y: y - 1.6, w: 3.2, d: 3.2, r: 0.5 };
      out.push(S(k.slabOf(post, FLOOR + 1, SHELF.z - FLOOR - 1, P, 2, 0.3), { tone: "mid", inner: L(k.sideSeam(post, 14, P, 2), { tone: "faint" }) }));
    }
    out.push(S(k.slabOf(SHELF, SHELF.z, SHELF.t, P, 3, 0.5), { tone: "mid", inner: L(k.sideSeam(SHELF, SHELF.z + 1.2, P, 3), { tone: "faint" }) }));
    out.push(L(k.planOutline(k.insetPlan(SHELF, 2), SHELF_TOP, P, 3), { tone: "faint" }));
    out.push(D(xs.flatMap((x) => [at([x, SHELF.y + 1.4, SHELF_TOP]), at([x, SHELF.y + SHELF.d - 1.4, SHELF_TOP])]), { size: 0.45 }));
    return out.join("");
  }
  // A terminal per engine, all lit while they read.
  function terminalsSvg(active) {
    const out = [];
    ENGINES.forEach((name, i) => {
      const t = terminalAt(i);
      const on = active;
      const plan = { x: t.x, y: t.y, w: t.w, d: t.d, r: 1.2 };
      out.push(S(k.slabOf(plan, SHELF_TOP, t.h, P, 3, 0.6), { tone: on ? "hi" : "mid", crease: "lo", lit: on, inner: L(k.sideSeam(plan, SHELF_TOP + 3, P, 3), { tone: "faint" }) }));
      const screen = { x: t.x + 3, y: t.y + 3, w: t.w - 6, d: t.d - 6, r: 0.6 };
      out.push(slab(screen, SHELF_TOP + t.h, 0.6, { tone: "lo", crease: "none" }));
      const ends = [];
      for (let j = 0; j < 3; j++) {
        const a = [screen.x + 1.5, screen.y + 2 + j * 3], b = [screen.x + screen.w * (0.5 + 0.15 * j), screen.y + 2 + j * 3];
        out.push(L(k.lineOnTop(a, b, SHELF_TOP + t.h + 0.6, P), { tone: on ? "hi" : "mid" }));
        ends.push(at([...a, SHELF_TOP + t.h + 0.6]), at([...b, SHELF_TOP + t.h + 0.6]));
      }
      out.push(D(ends, { size: 0.35, tone: on ? "hi" : "mid" }));
      // the port on its front face, where range reads arrive
      out.push(S(k.cylinder(t.x + t.w / 2, t.y + t.d, 1.4, SHELF_TOP + 3, 1, P, 18), { tone: on ? "hi" : "mid", lit: on }));
    });
    return out.join("");
  }
  function terminalLabels(active) {
    return ENGINES.map((name, i) => {
      const t = terminalAt(i);
      return parts.label([t.x + t.w / 2, t.y, SHELF_TOP + t.h], name, { dy: -8, sub: !active });
    }).join("");
  }

  // Along the front of the deck: uploaded but not sealed, and sealed. The newest stretch is
  // not in cold storage at all, and says so in words only.
  const BAND_Y = DECK.y + DECK.d - 2.4;
  function bandsSvg() {
    const band = (x0, x1, tone) => slab({ x: x0 + 0.6, y: BAND_Y - 0.9, w: x1 - x0 - 1.2, d: 1.8, r: 0.5 }, DECK_TOP, 0.7, { tone, crease: tone === "hi" ? "lo" : "none" }, 2, 0.2);
    return band(gates[2], gates[0], "mid") + band(X_END, gates[2], "hi");
  }
  function bandLabels() {
    const pt = (x) => [x, DECK.y + DECK.d, DECK.z];
    return [
      parts.label(pt((X_END + gates[2]) / 2), "SEALED", { dy: 30 }),
      parts.label(pt((X_END + gates[2]) / 2), "past DROP LOCAL, never changes", { dy: 41, sub: true }),
      parts.label(pt((gates[2] + gates[0]) / 2), "IN COLD STORAGE, NOT SEALED", { dy: 30 }),
      parts.label(pt((gates[2] + gates[0]) / 2), "a late write replaces the object", { dy: 41, sub: true }),
      parts.label(pt(X_NOW), "NOT UPLOADED YET", { anchor: "end", dy: 30 }),
      parts.label(pt(X_NOW), "the active partition and the last hour", { anchor: "end", dy: 41, sub: true }),
    ].join("");
  }

  function along(route, s) {
    const lens = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i][0], p[1] - route[i][1], p[2] - route[i][2]));
    let d = s * lens.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i]) return route[i].map((v, j) => v + (route[i + 1][j] - v) * (d / lens[i]));
      d -= lens[i];
    }
    return route[route.length - 1];
  }

  function render(reader, rangeKey, cols, u, hovered = null, t = 0) {
    const range = rangeOf(rangeKey);
    if (reader === "questdb") return { ...render2(rangeKey, cols, u, hovered, t), terminals: terminalsSvg(false), terminalLabels: terminalLabels(false) };
    // an external engine: QuestDB's bench carries on unlit and no caliper is drawn, since
    // the engine reads only the deck; every uploaded partition in range lights its chunks
    const base = render1(GRAIN, u, hovered, C);
    const bars = barsOf(cols);
    let lo = Infinity, hi = -Infinity, requests = 0;
    const q = (x) => Math.round(x * 20) / 20;
    const store = base.store.map((it) => {
      const span = spanOf(it.p, range, u);
      if (!span || !inColdStorage(it.p, u)) return it;
      lo = Math.min(lo, it.x);
      hi = Math.max(hi, it.x + it.len);
      requests += groupsOf(span) * columnRuns(cols) + 1;
      const key = it.key + "|x" + cols.join(",") + ":" + q(span[0]) + "-" + q(span[1]);
      return { ...it, key, html: () => it.html() + parts.readSvg(it.len, { form: "copy", f0: span[0], f1: span[1], bars, z0: DECK_TOP }) };
    });
    let rods = "";
    if (requests) {
      const back = STORE_Y - BLOCK.HALF + 2.2; // behind the Parquet partitions on the deck
      rods += L(k.lineOnTop([lo, back], [hi, back], DECK_TOP + 0.1, P), { tone: "lit" });
      rods += D([at([lo, back, DECK_TOP + 0.1]), at([hi, back, DECK_TOP + 0.1])], { size: 0.7, tone: "hi" });
      // one rod per engine, side by side: each leaves the run at its own point and keeps its
      // own lane across the aisle, so the five never cross
      const n = Math.min(6, Math.max(2, Math.round(Math.sqrt(requests) / 2)));
      ENGINES.forEach((_, e) => {
        const cx = lo + ((hi - lo) * (e + 0.5)) / ENGINES.length;
        const term = terminalAt(e);
        const tx = term.x + term.w / 2;
        const ay = AISLE_Y - 4 + e * 2; // nearer the shelf for the engines further along
        const route = [[cx, back, DECK_TOP + 0.1], [cx, back, ROD_Z], [cx, ay, ROD_Z], [tx, ay, ROD_Z], [tx, term.y + term.d + 1, SHELF_TOP + 3.5]];
        rods += L(route.slice(1).map((p, i) => k.segment(route[i], p, P)).join(""), { tone: "lit" });
        rods += D(route.slice(1).map(at), { size: 0.6, tone: "hi" });
        const flow = [];
        for (let j = 0; j < n; j++) flow.push(at(along(route, (t * 0.5 + j / n + e * 0.13) % 1)));
        rods += D(flow, { size: 0.9, tone: "hi" });
      });
    }
    return { ...base, store, rods, caliper: "", terminals: terminalsSvg(true), terminalLabels: terminalLabels(true) };
  }
  return Object.assign(render, { shelfSvg, bandsSvg, bandLabels, terminalsSvg, terminalLabels });
}
