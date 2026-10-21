// Everything that moves in Fig 1, for one moment. Pure: the build calls it for the
// stills, the live code every frame. Pallets and copies come back as keyed items, so
// the live code moves each one with a transform and rebuilds its markup only when its
// shape key changes; the rest comes back as markup.

import { INSTANCES, MANAGER, UNIT_SECONDS, WAL, dateOf, eventsOf, lampOf, laneState, partitionsAt, storeState } from "./model.mjs";
import { DECK_TOP, LANE_Y, STORE_Y, X_NOW, axisOf } from "./parts.mjs";

export const ticksOf = (g, u) => { if (g !== "MONTH") return g === "HOUR" ? 12 : 24; const d = dateOf(g, Math.floor(u) + 1e-6); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); };

export function makeScene(k, P, parts) {
  const q = (x) => Math.round(x * 5) / 5;

  return function render(g, u, hovered = null) {
    const { xOfAge } = axisOf(g);
    const ps = partitionsAt(g, u);
    const lanes = INSTANCES.map(() => []);
    const store = [];
    let copy = "", rods = "";
    let example = null;
    for (const p of ps) {
      const lit = p === hovered;
      const open = u < p + 1;
      const x0 = xOfAge(u - p), x1 = open ? X_NOW : xOfAge(u - p - 1);
      const gap = Math.min(0.8, (x1 - x0) * 0.1);
      const left = x0 + gap, len = x1 - x0 - (open ? gap : 2 * gap);
      if (len < 0.4) continue;
      const cold = [];
      INSTANCES.forEach((_, i) => {
        const s = laneState(g, p, i, u);
        const key = [q(len), open ? 1 : 0, q(s.m), q(s.sealed), q(s.evict), lit ? 1 : 0].join();
        lanes[i].push({ id: "p" + p, p, x: left, y: LANE_Y[i], len: q(len), open, key, html: () => parts.blockSvg(q(len), { m: s.m, sealed: s.sealed, evict: s.evict, lit, open }) });
        if (s.evict >= 0.7) cold.push(i);
      });
      const st = storeState(g, p, u);
      if (st.lift >= 1) store.push({ id: "c" + p, p, x: left, y: STORE_Y, len: q(len), key: [q(len), lit ? 1 : 0].join(), html: () => parts.copySvg(q(len), DECK_TOP, lit) });
      else if (st.lift >= 0) {
        const [, y, z] = parts.flight([left, LANE_Y[MANAGER], 1.2], [left, STORE_Y, DECK_TOP], st.lift);
        copy += `<g data-p="${p}" transform="${k.translateAlong(P, [left, y, 0])}">${parts.copySvg(len, z, lit, false)}</g>`;
      }
      if (cold.length === 3 && st.lift >= 1) example = p;
      if (cold.length && (lit || cold.length < 3)) rods += parts.rodSvg(left + len / 2, cold, lit);
      if (lit && cold.length === 3) example = null;
    }
    // one fully cold partition always shows its rod, so the read path is never hidden
    if (example !== null && hovered === null) {
      const x0 = xOfAge(u - example), x1 = xOfAge(u - example - 1);
      rods += parts.rodSvg((x0 + x1) / 2, [0, 1, 2], false);
    }

    // The WAL stream through the object store: the primary uploads a segment every
    // WAL.period; each lands in the replication bay, slides along it, and each replica
    // fetches it within moments. The segment that carries a seal is lit.
    const sealSegs = new Set(ps.map((p) => eventsOf(g, p).sealSeg));
    const n1 = Math.floor(u / WAL.period);
    const bay = [], flying = [];
    for (let n = n1; n > n1 - WAL.keep - 8; n--) {
      const t = n * WAL.period;
      const lit = sealSegs.has(n);
      const up = (u - t) / WAL.up;
      if (up < 0) continue;
      if (up < 1) { flying.push(parts.chipSvg(parts.flight(parts.PORT(0), parts.baySlot(0), up), lit)); continue; }
      const j = (u - t - WAL.up) / WAL.period;
      if (j < WAL.keep) bay.push({ j, html: parts.chipSvg(parts.baySlot(j), lit) });
      for (const i of [1, 2]) {
        const s = (u - t - WAL.up - WAL.wait[i]) / WAL.down;
        if (s >= 0 && s < 1) flying.push(parts.chipSvg(parts.flight(parts.baySlot(WAL.wait[i] / WAL.period), parts.PORT(i), s), lit));
      }
    }
    // farther slots first
    const wal = bay.sort((a, b) => a.j - b.j).reverse().map((c) => c.html).join("");

    const lamps = INSTANCES.map((_, i) => parts.lampSvg(i, lampOf(g, i, u, ps)));
    return { lanes, store, copy, rods, wal, flying: flying.join(""), feed: parts.feedSvg(u * UNIT_SECONDS / 2.5), lamps, hand: parts.handPath(u - Math.floor(u)) };
  };
}

// Serialise keyed items for the static build.
export const itemsSvg = (k, P, items) => items.map((it) => `<g data-id="${it.id}" data-p="${it.p}" transform="${k.translateAlong(P, [it.x, it.y, 0])}">${it.html()}</g>`).join("");
