// Fig 4's WAL view, drawn from the replication simulation at one moment. Pure: given the
// simulation state it returns markup for each layer. The benches stay as Fig 1 left them;
// what moves is the WAL: the primary's open segment on the gauge on its face, the throttle
// window on its dial, uploads into the replication bay, index.msgpack updating, and each
// replica polling, downloading and applying.

import { DECK, DECK_TOP, HEAD, LANE_Y, STORE_Y } from "./fig1/parts.mjs";
import { SEGMENT_MAX, VIS, ZSTD, sizeOf, txnText } from "./repl.mjs";

export const CARDS = { index: { x: 160, y: DECK.y + 3 }, parts: { x: 160, y: DECK.y + 8 } };

export function makeWal(k, P, parts) {
  const at = (pt) => k.iso(pt, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const lit = { tone: "lit", crease: "lo", lit: true };
  const plain = { tone: "hi", crease: "lo" };

  // a WAL segment object, as long as its compressed bytes (2 MiB stored as about 256 KiB)
  const chip = ([x, y, z], bytes, hot) => {
    const w = 2.4 + 6.4 * Math.min(1, (bytes * ZSTD) / SEGMENT_MAX);
    return S(k.slabOf({ x: x - w / 2, y: y - 2.8, w, d: 5.6, r: 0.6 }, z, 3, P, 2, 0.3), hot ? lit : plain);
  };
  // newest at the right end of the bay, on wider slots than Fig 1 used
  const slotOf = (rank) => [DECK.x + DECK.w - 7 - rank * 10, STORE_Y + 3, DECK_TOP];

  return function render(sim) {
    const s = sim.s, t = s.t;
    const segs = [...new Set([...s.bay.map((o) => o.seg), ...s.uploads.map((u) => u.seg)])].sort((a, b) => b - a);
    const rank = (seg) => segs.indexOf(seg);

    // the store: segment objects, a freshly landed one lit for a moment
    let bay = "";
    for (const o of [...s.bay].sort((a, b) => a.seg - b.seg)) {
      const r = rank(o.seg);
      if (r < 0 || r > 3) continue;
      bay += chip(slotOf(r), o.bytes, t - o.at < VIS.flash);
    }
    // index.msgpack and the _txn_parts file, as two cards standing at the back of the bay
    const card = ({ x, y }, hot) =>
      S(k.slabOf({ x, y, w: 12, d: 1.4, r: 0.3 }, DECK_TOP, 10, P, 2, 0.3), hot ? lit : plain) +
      "";
    bay = card(CARDS.parts, t - s.index.at < VIS.flash) + card(CARDS.index, t - s.index.at < VIS.flash) + bay;

    // in flight: uploads up from the primary, downloads down to each replica
    let flying = "";
    for (const u of s.uploads) {
      const f = (t - u.t0) / VIS.upload;
      if (f < 0 || f >= 1) continue;
      flying += chip(parts.flight(parts.PORT(0), slotOf(Math.max(0, rank(u.seg))), f), u.bytes, true);
    }
    for (const r of s.replicas) {
      const d = r.lastDown;
      if (!d) continue;
      const f = (t - d.t0) / VIS.download;
      if (f < 0 || f >= 1) continue;
      for (const seg of d.segs.slice(-3)) {
        const o = s.bay.find((b) => b.seg === seg);
        if (o) flying += chip(parts.flight(slotOf(Math.max(0, rank(seg))), parts.PORT(r.i), f), o.bytes, false);
      }
    }

    // polls: a short pulse from each replica's port up to the index, every second
    let pings = "";
    for (const r of s.replicas) {
      const f = (t - r.polledAt) / Math.min(VIS.ping, s.poll * 0.8);
      if (f < 0 || f >= 1) continue;
      const a = parts.PORT(r.i), b = [CARDS.index.x + 4.5, CARDS.index.y + 1.2, DECK_TOP + 3.5];
      const p = parts.flight(a, b, f);
      pings += k.dotsSvg([at(p)], { size: 0.8, tone: "hi" });
    }

    // the primary's open segment, as a gauge on the front of its head: full at 2 MiB
    const face = LANE_Y[0] + HEAD.d / 2;
    const x0 = HEAD.x + 2, w = HEAD.w - 4;
    const fill = Math.min(1, s.seg.bytes / SEGMENT_MAX);
    let gauge = S(k.slabOf({ x: x0, y: face, w, d: 0.5, r: 0.3 }, 2.4, 11.6, P, 2, 0.2), { tone: "hi", crease: "none" });
    if (fill > 0.01) gauge += S(k.slabOf({ x: x0 + 0.8, y: face + 0.5, w: (w - 1.6) * fill, d: 0.4, r: 0.2 }, 3.4, 9.6, P, 2, 0.15), lit);
    // a tick at each quarter of 2 MiB along the gauge's top edge
    let qt = "";
    for (let q = 1; q < 4; q++) { const x = x0 + 0.8 + ((w - 1.6) * q) / 4; qt += k.segment([x, face + 0.5, 13], [x, face + 0.5, 14], P); }
    gauge += k.lineSvg(qt, { tone: "mid" });

    // the dial on the primary times the throttle window: one turn is one window
    const hand = parts.handPath(s.pendingSince === null ? 0 : Math.min(1, (t - s.pendingSince) / s.throttle));

    const lamps = [0, 1, 2].map((i) => {
      if (i === 0) return parts.lampSvg(0, Math.max(0, ...s.uploads.map((u) => 1 - (t - u.t0) / VIS.upload)));
      const r = s.replicas[i - 1];
      const applying = t - r.appliedAt < VIS.flash ? 1 - (t - r.appliedAt) / VIS.flash : 0;
      return parts.lampSvg(i, applying);
    });

    // the words: what each instance holds right now
    const L = [];
    const head = (i) => [HEAD.x + HEAD.w, LANE_Y[i] + HEAD.d / 2, 4];
    const flushIn = s.pendingSince === null ? null : Math.max(0, s.throttle - (t - s.pendingSince));
    const line2 = `segment ${s.seg.id} open · ${sizeOf(s.seg.bytes)} of 2 MiB`;
    const line3 = flushIn === null ? "nothing waiting to upload" : `uploads in ${flushIn.toFixed(2)} s, or at 2 MiB`;
    L.push(parts.label(head(0), `PRIMARY · txn ${txnText(s.txn)}`, { anchor: "start", dx: -6, dy: 12 }));
    L.push(parts.label(head(0), line2, { anchor: "start", dx: -6, dy: 23, sub: true }));
    L.push(parts.label(head(0), line3, { anchor: "start", dx: -6, dy: 33, sub: true }));
    s.replicas.forEach((r) => {
      const lag = sim.lagOf(r);
      L.push(parts.label(head(r.i), `REPLICA ${r.i} · txn ${txnText(r.applied)}`, { anchor: "start", dx: 8, dy: -2 }));
      L.push(parts.label(head(r.i), lag.txns ? `${lag.txns} behind, ${lag.seconds.toFixed(1)} s` : "up to date", { anchor: "start", dx: 8, dy: 9, sub: true }));
    });
    const bayAt = [(CARDS.index.x + DECK.x + DECK.w) / 2, DECK.y + DECK.d, DECK.z];
    L.push(parts.label(bayAt, "WAL SEGMENTS · zstd, about 8x smaller", { dy: 13 }));
    const every = s.poll < 1 ? Math.round(s.poll * 1000) + " ms" : s.poll + " s";
    L.push(parts.label(bayAt, `index.msgpack at txn ${txnText(s.index.txn)} · polled every ${every}`, { dy: 25, sub: true }));

    return { bay, flying, pings, gauge, hand, lamps, labels: L.join("") };
  };
}
