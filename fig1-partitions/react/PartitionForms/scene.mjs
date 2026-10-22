// Everything that moves in a storage figure, for one moment. Pure: the builds call it for
// the stills, the live code every frame. Pallets and copies come back as keyed items, so
// the live code moves each one with a transform and rebuilds its markup only when its
// shape key changes; the rest comes back as markup. C is the cluster the figure shows:
// a single primary (SINGLE) or the primary and two replicas (CLUSTER).

import { CLUSTER, INSTANCES, POLICY, PRIMARY, UNIT_SECONDS, WAL, dateOf, eventsOf, lampOf, laneState, managerAt, nominal, partitionsAt, storeState } from "./model.mjs";
import { DECK_TOP, LANE_Y, STORE_Y, X_NOW, axisOf } from "./parts.mjs";

export const ticksOf = (g, u) => { if (g !== "MONTH") return g === "HOUR" ? 12 : 24; const d = dateOf(g, Math.floor(u) + 1e-6); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); };

export function makeScene(k, P, parts) {
  const q = (x) => Math.round(x * 5) / 5;

  return function render(g, u, hovered = null, C = CLUSTER) {
    const { xOfAge } = axisOf(g);
    const ps = partitionsAt(g, u);
    const n = C.lanes.length;
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
      const st = storeState(g, p, u, C);
      // DROP REMOTE: gone from every bench at once; its Parquet partition dims through the
      // grace period, then fades as the objects are reclaimed
      if (st.gone >= 1) continue;
      for (const i of C.lanes) {
        const s = laneState(g, p, i, u, C);
        if (s.gone > 0) continue;
        const key = [q(len), open ? 1 : 0, q(s.m), q(s.sealed), q(s.evict), lit ? 1 : 0].join();
        lanes[i].push({ id: "p" + p, p, x: left, y: LANE_Y[i], len: q(len), open, key, html: () => parts.blockSvg(q(len), { m: s.m, sealed: s.sealed, evict: s.evict, lit, open }) });
        if (s.evict >= 0.7) cold.push(i);
      }
      if (st.lift >= 1) {
        const dim = st.deleting || st.gone > 0;
        const fade = st.gone > 0 ? 1 - st.gone : dim ? 0.45 : 1;
        store.push({ id: "c" + p, p, x: left, y: STORE_Y, len: q(len), opacity: fade, key: [q(len), lit ? 1 : 0].join(), html: () => parts.copySvg(q(len), DECK_TOP, lit) });
      }
      else if (st.lift >= 0) {
        const [, y, z] = parts.flight([left, LANE_Y[eventsOf(g, p, C).upBy], 1.2], [left, STORE_Y, DECK_TOP], st.lift);
        copy += `<g data-p="${p}" transform="${k.translateAlong(P, [left, y, 0])}">${parts.copySvg(len, z, lit, false)}</g>`;
      }
      if (cold.length === n && st.lift >= 1) example = p;
      if (cold.length && (lit || cold.length < n)) rods += parts.rodSvg(left + len / 2, cold, lit);
      if (lit && cold.length === n) example = null;
    }
    // With DROP REMOTE a year out, the partitions too thin to draw one by one, all past DROP
    // LOCAL, show as one strip on every bench and on the deck, up to the DROP REMOTE mark
    if (POLICY.dropRemote && ps.length) {
      // from the mark up to the oldest partition drawn on its own
      const drawn = lanes[C.lanes[0]];
      const x1 = (drawn.length ? Math.min(...drawn.map((it) => it.x)) : xOfAge(u - ps[0])) - 0.6, x0 = xOfAge(nominal(g)[3]) + 0.3;
      const len = q(x1 - x0);
      if (len > 0.6) {
        // thin slices a unit apart: each stands for the partitions at that age, local
        // metadata only on the benches, Parquet partitions on the deck
        const slices = (z0, h, style, y0, d) => {
          let out = "";
          for (let x = len - 0.8; x > 0; x -= 1.1) out += parts.slab({ x, y: y0, w: 0.6, d, r: 0.1 }, z0, h, style, 2, 0.1);
          return out;
        };
        const pm = { tone: "blue", crease: "lo", className: "sa-pm" }, pq = { tone: "blue", crease: "lo", className: "sa-pq" };
        for (const i of C.lanes) lanes[i].unshift({ id: "older", p: ps[0] - 1, x: x0, y: LANE_Y[i], len, open: false, key: "older" + len, html: () => slices(0, 4.6, pm, -12, 24) });
        store.unshift({ id: "older-c", p: ps[0] - 1, x: x0, y: STORE_Y, len, key: "older" + len, html: () => slices(DECK_TOP, 3.6, pq, -9, 21) });
      }
    }
    // one fully cold partition always shows its rod, so the read path is never hidden
    if (example !== null && hovered === null) {
      const x0 = xOfAge(u - example), x1 = xOfAge(u - example - 1);
      rods += parts.rodSvg((x0 + x1) / 2, C.lanes, false);
    }

    // The WAL stream through the object store, only when there are replicas to feed: the
    // primary uploads a segment every WAL.period; each lands in the replication bay,
    // slides along it, and each replica fetches it within moments. A seal's segment is lit.
    const bay = [], flying = [];
    const replicas = C.lanes.filter((i) => i !== PRIMARY);
    if (replicas.length) {
      const sealSegs = new Set(ps.map((p) => eventsOf(g, p, C).sealSeg));
      const n1 = Math.floor(u / WAL.period);
      for (let s0 = n1; s0 > n1 - WAL.keep - 8; s0--) {
        const t = s0 * WAL.period;
        const lit = sealSegs.has(s0);
        const up = (u - t) / WAL.up;
        if (up < 0) continue;
        if (up < 1) { flying.push(parts.chipSvg(parts.flight(parts.PORT(0), parts.baySlot(0), up), lit)); continue; }
        const j = (u - t - WAL.up) / WAL.period;
        if (j < WAL.keep) bay.push({ j, html: parts.chipSvg(parts.baySlot(j), lit) });
        for (const i of replicas) {
          if (managerAt(C, u).down === i) continue; // an instance that is down fetches nothing
          const s = (u - t - WAL.up - WAL.wait[i]) / WAL.down;
          if (s >= 0 && s < 1) flying.push(parts.chipSvg(parts.flight(parts.baySlot(WAL.wait[i] / WAL.period), parts.PORT(i), s), lit));
        }
      }
    }
    // farther slots first
    const wal = bay.sort((a, b) => a.j - b.j).reverse().map((c) => c.html).join("");

    const lamps = INSTANCES.map((_, i) => (C.lanes.includes(i) ? parts.lampSvg(i, lampOf(g, i, u, ps, C)) : ""));
    return { lanes, store, copy, rods, wal, flying: flying.join(""), feed: parts.feedSvg(u * UNIT_SECONDS / 2.5), lamps, hand: parts.handPath(u - Math.floor(u)) };
  };
}

// Serialise keyed items for the static build.
export const itemsSvg = (k, P, items) => items.map((it) => `<g data-id="${it.id}" data-p="${it.p}"${(it.opacity ?? 1) < 0.999 ? ` opacity="${it.opacity.toFixed(2)}"` : ""} transform="${k.translateAlong(P, [it.x, it.y, 0])}">${it.html()}</g>`).join("");
