// Everything that changes in Fig 2, for one query at time u. Pure: the build calls it for
// the stills, the live code every frame. Fig 1's live scene supplies the cluster at u
// (partitions ageing, uploads, conversions, the WAL stream); this adds what the query
// reads, the caliper that marks its time range, and the range reads travelling down from
// the object store for cold partitions. t is the screen time for the read animation.

import { axisOf, DECK_TOP, BENCH, LANE_Y, POST_TOP, POST_Y, ROD_Z, STORE_Y, X_END, X_NOW, BLOCK } from "./fig1/parts.mjs";
import { C, GRAIN, SERVER, barsOf, groupsOf, columnRuns, rangeOf, spanOf, tierOf } from "./query.mjs";

export function makeFigure(k, P, parts, render1) {
  const { xOfAge } = axisOf(GRAIN);
  const at = (pt) => k.iso(pt, P);

  return function render(rangeKey, cols, u, hovered = null, t = 0) {
    const range = rangeOf(rangeKey);
    const base = render1(GRAIN, u, hovered, C);
    const bars = barsOf(cols);
    const lanes = base.lanes.map((items, i) =>
      i !== SERVER
        ? items
        : items.map((it) => {
            const span = spanOf(it.p, range, u);
            if (!span) return it;
            const form = tierOf(it.p, u) === "native" ? "native" : "parquet";
            const q = (x) => Math.round(x * 20) / 20;
            const key = it.key + "|" + cols.join(",") + ":" + q(span[0]) + "-" + q(span[1]);
            return { ...it, key, html: () => it.html() + parts.readSvg(it.len, { form, f0: span[0], f1: span[1], bars, open: it.open }) };
          }),
    );
    // Cold partitions in range: the same chunks light on their Parquet partitions on the deck,
    // and one rod over the middle of the cold run carries all their range reads down.
    let lo = Infinity, hi = -Infinity, requests = 0;
    const store = base.store.map((it) => {
      const span = spanOf(it.p, range, u);
      if (!span || tierOf(it.p, u) !== "cold") return it;
      lo = Math.min(lo, it.x);
      hi = Math.max(hi, it.x + it.len);
      requests += groupsOf(span) * columnRuns(cols);
      const q = (x) => Math.round(x * 20) / 20;
      const key = it.key + "|" + cols.join(",") + ":" + q(span[0]) + "-" + q(span[1]);
      return { ...it, key, html: () => it.html() + parts.readSvg(it.len, { form: "copy", f0: span[0], f1: span[1], bars, z0: DECK_TOP }) };
    });
    let rods = "";
    if (requests) {
      const cx = (lo + hi) / 2;
      rods += parts.rodSvg(cx, [SERVER], true);
      // the deck end of the rod spans the whole cold run
      rods += k.lineSvg(k.lineOnTop([lo, STORE_Y + BLOCK.HALF + 0.6], [hi, STORE_Y + BLOCK.HALF + 0.6], DECK_TOP + 0.1, P), { tone: "lit" });
      rods += k.dotsSvg([at([lo, STORE_Y + BLOCK.HALF + 0.6, DECK_TOP + 0.1]), at([hi, STORE_Y + BLOCK.HALF + 0.6, DECK_TOP + 0.1])], { size: 0.7, tone: "hi" });
      const route = [[cx, STORE_Y + BLOCK.HALF, ROD_Z], [cx, LANE_Y[SERVER] + POST_Y, ROD_Z], [cx, LANE_Y[SERVER] + POST_Y, POST_TOP]];
      const n = Math.min(8, Math.max(2, Math.round(Math.sqrt(requests))));
      const flow = [];
      for (let j = 0; j < n; j++) flow.push(at(along(route, (t * 0.5 + j / n) % 1)));
      rods += k.dotsSvg(flow, { size: 1, tone: "hi" });
    }
    return { ...base, lanes, store, rods, caliper: caliperSvg(range, u) };
  };

  function along(route, s) {
    const lens = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i][0], p[1] - route[i][1], p[2] - route[i][2]));
    let d = s * lens.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i]) return route[i].map((v, j) => v + (route[i + 1][j] - v) * (d / lens[i]));
      d -= lens[i];
    }
    return route[route.length - 1];
  }

  // The caliper: two jaws standing in front of the serving bench at the ends of the time
  // range, joined by a rail, so the reader sees which partitions the query covers. Its
  // ends are ages, so it stays put while the partitions move through it.
  function caliperSvg(range) {
    const xa = Math.max(X_END, xOfAge(range.ages[1])), xb = Math.min(X_NOW, xOfAge(range.ages[0]));
    const y = LANE_Y[SERVER] + BENCH.d / 2 + 1.6;
    const z0 = -BENCH.t, z1 = 15;
    const style = { tone: "lit", crease: "lo", lit: true };
    let out = "";
    for (const x of [xa, xb]) {
      out += k.solidSvg(k.slabOf({ x: x - 0.8, y: y - 0.8, w: 1.6, d: 1.6, r: 0.3 }, z0, z1 - z0, P, 2, 0.2), style);
      out += k.solidSvg(k.slabOf({ x: x - 0.4, y: y - BENCH.d - 1.6, w: 0.8, d: BENCH.d + 1.6, r: 0.2 }, z1 - 1, 1, P, 2, 0.15), style);
    }
    out += k.solidSvg(k.slabOf({ x: xa, y: y - 0.7, w: xb - xa, d: 1.4, r: 0.3 }, z1, 1.4, P, 2, 0.2), style);
    return out;
  }
}
