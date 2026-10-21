// The static scene every figure in the series shares: the object-store deck, the three
// instance benches with their heads, and the client feed into the primary. Each figure
// builds its own moving layers on top. `k` is the iso kit, `G` the lathe kit.

import { BAY_X, BENCH, DECK, DECK_TOP, FEED, FLOOR, FLY_Z, HEAD, LANE_Y, RULER, STORE_Y, X_NOW } from "./parts.mjs";

export const AZIMUTH = 56;
export const benchPlan = (i) => ({ x: BENCH.x, y: LANE_Y[i] - BENCH.d / 2, w: BENCH.w, d: BENCH.d, r: BENCH.r });
export const headPlan = (i) => ({ x: HEAD.x, y: LANE_Y[i] - HEAD.d / 2, w: HEAD.w, d: HEAD.d, r: 2 });

// One camera for the whole series, so every figure frames the same machine.
export function projectionOf(k, width, height) {
  return k.fitProjection(
    [
      ...LANE_Y.flatMap((_, i) => k.boxCorners(benchPlan(i), FLOOR, 0)),
      ...k.boxCorners(DECK, FLOOR, DECK_TOP + 6),
      ...k.boxCorners(RULER, FLOOR, FLOOR + 1),
      [X_NOW, LANE_Y[0], FLY_Z + 3],
      [X_NOW, STORE_Y, FLY_Z + 3],
      [HEAD.x + HEAD.w + 26, LANE_Y[0] + 8, 4],
      [HEAD.x + HEAD.w + 70, LANE_Y[1], 6],
    ],
    width,
    height,
    { pad: 14, azimuth: AZIMUTH },
  );
}

export const NAMES = [
  ["PRIMARY", "writes the WAL"],
  ["REPLICA 1", "reads the WAL"],
  ["REPLICA 2", "reads the WAL", "cold storage manager"],
];

export function makeStage(k, G, P, parts) {
  const at = (point) => k.iso(point, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const D = (points, style) => k.dotsSvg(points, style);
  const f1 = (v) => v.toFixed(1);
  const onFaceY = (y, pts) => "M" + pts.map(([x, z]) => at([x, y, z]).map(f1).join(" ")).join("L") + "Z";
  const rect = (a0, a1, z0, z1) => [[a0, z0], [a1, z0], [a1, z1], [a0, z1]];
  const T = (m, s, o) => k.faceTextSvg(m, s, o);

  function feet(plan, xs) {
    const out = [];
    const ys = [plan.y + 4, plan.y + plan.d - 4];
    const spots = xs.flatMap((x) => ys.map((y) => [x, y])).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
    for (const [x, y] of spots) {
      out.push(S(k.cylinder(x, y, 3.6, FLOOR, 1.2, P, 24), { tone: "lo" }));
      out.push(S(k.cylinder(x, y, 2.6, FLOOR + 1.2, BENCH.foot - 1.2, P, 22), { tone: "mid" }));
    }
    return out.join("");
  }

  // The object store: one deck behind every instance. Parquet partitions on the left, the
  // replication bay for WAL segments on the right, behind the heads.
  // bay: draw the replication bay (only once there are replicas); sign: the board text
  function deck({ bay = true, sign = "OBJECT STORE · ONE FOR THE WHOLE CLUSTER" } = {}) {
    const out = [`<path class="iso-halo" d="${k.haloOf(DECK, FLOOR, 2, P)}"/>`];
    const xs = [DECK.x + 5, DECK.x + DECK.w * 0.36, DECK.x + DECK.w * 0.7, DECK.x + DECK.w - 5];
    const ys = [DECK.y + 3, DECK.y + DECK.d - 3];
    for (const y of ys) {
      for (const x of xs) {
        out.push(S(k.slabOf({ x: x - 4, y: y - 4, w: 8, d: 8, r: 1 }, FLOOR, 1, P, 2), { tone: "lo" }));
        const post = { x: x - 1.8, y: y - 1.8, w: 3.6, d: 3.6, r: 0.5 };
        out.push(S(k.slabOf(post, FLOOR + 1, DECK.z - FLOOR - 1, P, 2, 0.3), { tone: "mid", inner: L(k.sideSeam(post, 14, P, 2), { tone: "faint" }) }));
      }
      if (y === ys[0]) out.push(S(k.slabOf({ x: xs[0], y: y - 1, w: xs[3] - xs[0], d: 2, r: 0.4 }, 6, 2.4, P, 2, 0.3), { tone: "mid", crease: "none" }));
    }
    for (const x of xs) out.push(S(k.slabOf({ x: x - 1.2, y: DECK.y + 3, w: 2.4, d: DECK.d - 6, r: 0.4 }, DECK.z - 4, 4, P, 2), { tone: "mid", crease: "none" }));
    out.push(S(k.slabOf(DECK, DECK.z, DECK.t, P, 3, 0.5), { tone: "mid", inner: L(k.sideSeam(DECK, DECK.z + 1.2, P, 3), { tone: "faint" }) }));
    out.push(L(k.planOutline(k.insetPlan(DECK, 2), DECK_TOP, P, 3), { tone: "faint" }));
    // the rib between the cold storage root and the replication root, and the bay's rails,
    // which the WAL segments slide along
    if (bay) {
      out.push(S(k.slabOf({ x: BAY_X - 4, y: DECK.y + 2, w: 1.6, d: DECK.d - 4, r: 0.4 }, DECK_TOP, 2.4, P, 2, 0.3), { tone: "mid" }));
      out.push(L(k.lineOnTop([BAY_X - 2.4, STORE_Y - 1], [DECK.x + DECK.w - 2.5, STORE_Y - 1], DECK_TOP, P) + k.lineOnTop([BAY_X - 2.4, STORE_Y + 5], [DECK.x + DECK.w - 2.5, STORE_Y + 5], DECK_TOP, P), { tone: "lo" }));
    }
    out.push(D(xs.flatMap((x) => [at([x, DECK.y + 1.4, DECK_TOP]), at([x, DECK.y + DECK.d - 1.4, DECK_TOP])]), { size: 0.45 }));
    // a sign board along the back edge, above the partitions, so the name is never covered
    const board = { x: DECK.x + 8, y: DECK.y + 0.4, w: 150, d: 1.6, r: 0.4 };
    for (const x of [board.x + 6, board.x + board.w - 6]) out.push(S(k.slabOf({ x: x - 1, y: board.y, w: 2, d: 1.6, r: 0.3 }, DECK_TOP, 5, P, 2), { tone: "mid" }));
    out.push(S(k.slabOf(board, DECK_TOP + 5, 8, P, 2, 0.4), { tone: "mid" }));
    out.push(T(k.sideMatrix([board.x + 4, board.y + board.d], DECK_TOP + 7.6, P, "left"), sign, { size: 4.4, tone: "hi" }));
    out.push(D([at([board.x + 2, board.y + board.d, DECK_TOP + 11]), at([board.x + board.w - 2, board.y + board.d, DECK_TOP + 11])], { size: 0.45 }));
    return out.join("");
  }

  function benchBack(i) {
    const plan = benchPlan(i);
    const out = [`<path class="iso-halo" d="${k.haloOf(plan, FLOOR, BENCH.foot, P)}"/>`];
    out.push(feet(plan, [plan.x + 8, plan.x + plan.w / 2, plan.x + plan.w - 8]));
    out.push(S(k.slabOf(plan, -BENCH.t, BENCH.t, P, 6, 1.2), { tone: "mid", inner: L(k.sideSeam(plan, -BENCH.t + 1.8, P, 6), { tone: "faint" }) }));
    out.push(L(k.planOutline(k.insetPlan(plan, 2.2), 0, P, 6), { tone: "faint" }));
    out.push(S(k.slabOf({ x: plan.x + 2.2, y: plan.y + 2.6, w: 2.4, d: plan.d - 5.2, r: 0.4 }, 0, 3, P, 2, 0.3), { tone: "mid" }));
    return out.join("");
  }

  // The instance head: where rows arrive and the active partition is written. It carries
  // the table metadata (_meta, _txn, _cv), a lamp for its policy check, and a WAL port.
  // port: the WAL port on top, only when the figure shows replication
  function head(i, { port = true } = {}) {
    const plan = headPlan(i);
    const y = plan.y;
    const out = [];
    out.push(S(k.slabOf({ x: X_NOW - 1.2, y: y + 0.6, w: 3.6, d: plan.d - 1.2, r: 0.6 }, 0, 11, P, 2, 0.4), { tone: "mid" }));
    out.push(S(k.slabOf(plan, 0, HEAD.h, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(plan, 4, P, 4), { tone: "faint" }) }));
    out.push(L(k.planOutline(k.insetPlan(plan, 1.6), HEAD.h, P, 4), { tone: "faint" }));
    const face = y + plan.d;
    if (i !== 0) out.push(L(onFaceY(face, rect(plan.x + 3, plan.x + plan.w - 3, 4.2, 13.4)), { tone: "lo" }));
    out.push(D([at([plan.x + 2.4, face, HEAD.h - 2.4]), at([plan.x + plan.w - 2.4, face, HEAD.h - 2.4]), at([plan.x + 2.4, face, 2.4]), at([plan.x + plan.w - 2.4, face, 2.4])], { size: 0.42 }));
    // the metadata cards in their holder
    const holder = { x: plan.x + 3, y: y + 4, w: 13, d: plan.d - 8, r: 0.8 };
    out.push(S(k.slabOf(holder, HEAD.h, 1.2, P, 2, 0.3), { tone: "lo" }));
    [y + 7.5, y + 13.5, y + 19.5].forEach((cy, n) => {
      out.push(S(k.slabOf({ x: holder.x + 1.4, y: cy, w: holder.w - 2.8, d: 0.9, r: 0.2 }, HEAD.h + 1.2, 6.5, P, 2), { tone: "hi", crease: "lo" }));
      out.push(S(k.slabOf({ x: holder.x + 1.8 + n * 3.2, y: cy, w: 3.2, d: 0.9, r: 0.2 }, HEAD.h + 7.7, 1.6, P, 2), { tone: "hi", crease: "lo" }));
    });
    // the WAL port, where segments leave the primary and arrive at the replicas
    if (port) {
      const [px, py] = parts.PORT(i);
      out.push(S(k.cylinder(px, py, 3, HEAD.h, 0.6, P, 28), { tone: "lo" }));
      out.push(L(k.ring(px, py, 2.1, HEAD.h + 0.6, P, 24), { tone: "mid" }));
    }
    return out.join("");
  }

  // Upright labels that never change: each instance beside its head, and the bay.
  // `names` lets a figure say what each instance does in it; `lanes` which benches exist;
  // `bay` whether the replication bay is there to label.
  function staticLabels(names = NAMES, { extras = true, lanes = [0, 1, 2], bay: hasBay = true } = {}) {
    const out = [];
    lanes.forEach((i) => {
      const y = LANE_Y[i];
      const pt = [HEAD.x + HEAD.w, y + HEAD.d / 2, 4];
      const down = i === 0 ? 14 : 0; // clear of the client feed above it
      const dx = i === 0 ? -6 : 8;
      out.push(parts.label(pt, names[i][0], { anchor: "start", dx, dy: -2 + down }));
      names[i].slice(1).forEach((s, n) => out.push(parts.label(pt, s, { anchor: "start", dx, dy: 9 + n * 10 + down, sub: true })));
    });
    if (!extras) return out.join("");
    out.push(parts.label([FEED.x1, FEED.y, FEED.z], "ROWS FROM CLIENTS", { anchor: "start", dx: 6, dy: 6 }));
    if (!hasBay) return out.join("");
    const bay = [(BAY_X + DECK.x + DECK.w) / 2, DECK.y + DECK.d, DECK.z];
    out.push(parts.label(bay, "WAL SEGMENTS", { dy: 13 }));
    out.push(parts.label(bay, "replication, continuous", { dy: 25, sub: true }));
    return out.join("");
  }

  // The client feed: a duct into the far side of the primary's head, away from the floor
  // marks, on a post; rows ride along its top into the head.
  function feed() {
    const { y, x0, x1, z } = FEED;
    const out = [];
    const post = { x: x1 - 4.6, y: y - 1.6, w: 3.2, d: 3.2, r: 0.5 };
    out.push(S(k.slabOf({ x: x1 - 6.4, y: y - 3.4, w: 6.8, d: 6.8, r: 0.8 }, FLOOR, 1, P, 2), { tone: "lo" }));
    out.push(S(k.slabOf(post, FLOOR + 1, z - 2.4 - FLOOR - 1, P, 2, 0.3), { tone: "mid" }));
    const duct = { x: x0, y: y - 1.6, w: x1 - x0, d: 3.2, r: 0.6 };
    out.push(S(k.slabOf(duct, z - 2.4, 2.4, P, 2, 0.3), { tone: "mid", inner: L(k.lineOnTop([x0 + 0.8, y], [x1 - 0.8, y], z, P), { tone: "lo" }) }));
    out.push(S(G.disc(0, 0.6, 3, G.frameAlong([x0, y, z - 1.2], [1, 0, 0]), P), { tone: "mid" }));
    return out.join("");
  }

  return { deck, benchBack, head, feed, staticLabels };
}

// The darker tones the series uses in dark mode: the kit default sits too close to the card.
export const DARK = "--anatomy-face:#242424;--anatomy-top:#2c2c2c;--anatomy-shade-0:#161616;--anatomy-shade-1:#1c1c1c;--anatomy-shade-2:#222;--anatomy-shade-3:#292929;--anatomy-lit-top:#3c3c3c;--anatomy-lit-shade:#303030;--anatomy-hi:#f2f2f2;--anatomy-mid:#a6a6a6;--anatomy-lo:#747474;--anatomy-faint:#4a4a4a;--anatomy-dot:#f2f2f2;--anatomy-weight:.7px";
