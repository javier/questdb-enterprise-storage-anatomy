// Fig 7's moving parts at time u: Fig 8's cluster (primary, replica, object store with the
// WAL tape, backup stand) through an object store outage, plus a durable-ACK client at the
// end of the feed with its store-and-forward buffer as a gauge.

import { DECK, FEED, FLOOR, HEAD, LANE_Y, X_NOW, axisOf } from "../fig1-partitions/parts.mjs";
import { eventsOf, nameOf, partitionsAt } from "../fig1-partitions/model.mjs";
import { STAND, STORE6 } from "../fig8-backups/draw.mjs";
import { C7, CATCH_UP, FAILED, GRAIN, SF_CAP_GIB, W0, W1, backlogOf, bufferOf, fullAt, lagOf, phaseOf, waitingOf } from "./outage.mjs";

// the client past the end of the feed, drawn as Fig 6's: a box on feet with its
// store-and-forward ring on top, one cell lit per share of the buffer in use
export const CLIENT7 = { x: FEED.x1 + 8, y: FEED.y - 9, w: 30, d: 18, h: 12 };
const CELLS = 60; // two rows of 30, as in Fig 6
const PORT7 = [CLIENT7.x, CLIENT7.y + CLIENT7.d / 2, 9];

export function makeOutage(k, P, parts, scene, backups) {
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const D = (pts, style) => k.dotsSvg(pts, style);
  const at = (pt) => k.iso(pt, P);
  const slab = (plan, z, h, style) => S(k.slabOf(plan, z, h, P, 2, Math.min(0.3, h / 3)), style);

  // the client, static, as Fig 6 draws it: feet, the case with its seam, the ring's panel
  // and the port facing the feed
  function clientSvg() {
    const { x, y, w, d, h } = CLIENT7;
    let out = "";
    for (const [fx, fy] of [[x + 3, y + 3], [x + w - 3, y + 3], [x + 3, y + d - 3], [x + w - 3, y + d - 3]]) out += S(k.cylinder(fx, fy, 1.6, -10, 10, P, 18), { tone: "mid" });
    out += S(k.slabOf({ x, y, w, d, r: 1.5 }, 0, h, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam({ x, y, w, d, r: 1.5 }, 3.5, P, 3), { tone: "faint" }) });
    out += slab({ x: x + 1.5, y: y + 2, w: w - 3, d: d - 4, r: 0.6 }, h, 0.8, { tone: "lo", crease: "none" });
    out += S(k.cylinder(PORT7[0], PORT7[1], 1.5, 7.5, 3, P, 18), { tone: "mid" });
    return out;
  }
  // the ring: a lit cell per sixtieth of the buffer in use, as Fig 6 lights unacknowledged frames
  function gaugeSvg(gib) {
    const { x, y, d, h } = CLIENT7;
    const n = Math.round(Math.min(1, gib / SF_CAP_GIB) * CELLS);
    let out = "";
    for (let c = 0; c < n; c++) {
      const row = Math.floor(c / 30), col = c % 30;
      out += slab({ x: x + 1.9 + col * 0.88, y: y + 3 + (row * (d - 6)) / 2, w: 0.72, d: (d - 6) / 2 - 0.4, r: 0.12 }, h + 0.8, 1.4, { tone: "lit", crease: "lo", lit: true });
    }
    return out;
  }
  // WAL the primary keeps because it could not upload it: a stack of segments by its port
  function pileSvg(days) {
    const n = Math.min(14, Math.round(days * 4.5));
    const [px, py] = parts.PORT(0);
    let out = "";
    for (let j = 0; j < n; j++) {
      const col = j % 2, row = Math.floor(j / 2);
      out += parts.chipSvg([px - 7 - col * 4.2, py + 4, HEAD.h + 0.6 + row * 1.7], j >= n - 2);
    }
    return out;
  }

  const span = (days) => {
    const h = Math.round(days * 24);
    return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d ${h % 24}h`;
  };

  function render(u, t) {
    const phase = phaseOf(u);
    const ps = partitionsAt(GRAIN, u);
    const f = scene(GRAIN, u, null, C7);
    const b = backups(u, 5, [], null, { failed: FAILED, outage: { from: W0, to: W1, catchUp: CATCH_UP } });
    const gib = bufferOf(u);
    const wait = waitingOf(u, ps, eventsOf);
    const down = phase === "outage";

    // the words
    const W = [];
    const beside = (i) => [HEAD.x + HEAD.w, LANE_Y[i] - HEAD.d / 2, HEAD.h];
    const under = (i) => [HEAD.x + HEAD.w, LANE_Y[i] + HEAD.d / 2, 4];
    W.push(parts.label(beside(0), "PRIMARY", { anchor: "start", dx: 8, dy: -6 }));
    W.push(parts.label(beside(0), down ? `keeps ingesting · ${span(backlogOf(u))} of WAL kept locally` : phase === "catchup" ? "uploading the backlog" : "uploads its WAL every second", { anchor: "start", dx: 8, dy: 4, sub: true }));
    W.push(parts.label(under(1), "REPLICA", { anchor: "start", dx: -6, dy: 12 }));
    W.push(parts.label(under(1), lagOf(u) > 0.01 ? `behind by ${span(lagOf(u))} · still serving its data` : "applies the WAL from the object store", { anchor: "start", dx: -6, dy: 22, sub: true }));
    const cl = [CLIENT7.x + CLIENT7.w, CLIENT7.y + CLIENT7.d / 2, CLIENT7.h];
    W.push(parts.label(cl, "CLIENT · DURABLE ACK", { anchor: "start", dx: 8, dy: 2 }));
    const full = down && u >= fullAt;
    W.push(parts.label(cl, full ? "FULL · appends block, then throw" : `${gib.toFixed(gib < 1 ? 2 : 1)} of ${SF_CAP_GIB} GiB unacknowledged`, { anchor: "start", dx: 8, dy: 13, sub: !full }));
    const deckAt = [(DECK.x + X_NOW) / 2, STORE6.y + STORE6.d, STORE6.z];
    if (down) {
      W.push(parts.label(deckAt, "OBJECT STORE UNREACHABLE", { dy: 13 }));
      W.push(parts.label(deckAt, `for ${span(u - W0)} · every part retries on its own`, { dy: 24, sub: true }));
    }
    let row = down ? 35 : 13;
    if (wait.upload || wait.local) {
      const bits = [];
      if (wait.upload) bits.push(`${wait.upload} waiting for TO REMOTE`);
      if (wait.local) bits.push(`${wait.local} past DROP LOCAL kept local`);
      W.push(parts.label(deckAt, bits.join(" · "), { dy: row, sub: true }));
      row += 11;
    }
    const failedSince = FAILED.filter((x) => x <= u).length;
    if (failedSince && u < 64 + 0.2) W.push(parts.label(deckAt, `${failedSince} nightly backup${failedSince === 1 ? "" : "s"} failed · none retried until the next run`, { dy: row, sub: true }));

    return { f, b, gauge: gaugeSvg(gib), pile: pileSvg(backlogOf(u)), labels: W.join(""), remote: down ? 0.45 : 1, phase, wait, gib, full };
  }
  return Object.assign(render, { clientSvg });
}

// One line for the readout.
export function storyOf7(u, t, clock) {
  const phase = phaseOf(u);
  const ps = partitionsAt(GRAIN, u);
  const wait = waitingOf(u, ps, eventsOf);
  if (phase === "before") return `${clock} · all well · the store goes down at 20:00`;
  if (phase === "outage") {
    const lines = [
      "ingest and local queries carry on; the primary keeps every WAL segment it could not upload, with no cap but the disk",
      "the replica polls every second, fails, and keeps serving what it has",
      "durable-ACK clients get no acks and keep buffering; plain-ACK clients are unaffected",
      `TO REMOTE waits${wait.upload ? ` (${wait.upload})` : ""}; DROP LOCAL seals but keeps the data local${wait.local ? ` (${wait.local})` : ""}`,
      "a query on a partition served from cold storage fails: cold-storage download failed",
      "the nightly backup fails and is recorded as failed; the WAL cleaner deletes nothing",
    ];
    return `${clock} · store unreachable · ${lines[Math.floor(t / 3) % lines.length]}`;
  }
  if (phase === "catchup") return `${clock} · store back · the backlog goes up in txn order, the replica catches up, the client is trimmed by one cumulative durable ack`;
  return `${clock} · caught up · pending partitions uploaded, seals completed; the next backup runs at midnight`;
}
