// Fig 5's moving parts, drawn from a recorded run at time t. Pure: markup per layer.
// The benches stay as Fig 3 left them; what moves is the client and its store-and-forward
// ring, the frames and acks on its connection, its probes while there is no primary, the
// WAL uploads and downloads through the store, index.msgpack changing hands, and the
// operator's commands as they are issued.

import { DECK, DECK_TOP, HEAD, LANE_Y, STORE_Y } from "../fig1-partitions/parts.mjs";
import { MODES, VIS, snapAt } from "./fail.mjs";

export const CLIENT = { x: 238, y: 76, w: 30, d: 18, h: 12 };
const CELLS = 60; // ring cells shown, two rows of 30
export const CARDS = { index: { x: 160, y: DECK.y + 3 } };
export const NODE_NAMES = ["NODE A", "NODE B", "NODE C"];
const FADE_DOWN = 0.4;

const COMMANDS = {
  demote: "SQL › SWITCH ROLE TO REPLICA",
  promote: "SQL › SWITCH ROLE TO PRIMARY",
  stop: "RESTART TO APPLY AN UPDATE",
  start: "UP · replication.role=replica",
  fail: "CRASH",
};

// The last operator command at or before t, optionally for one node.
const lastCommand = (rec, t, node) => {
  let c = null;
  for (const x of rec.commands) if (x.t <= t && (node === undefined || x.node === node)) c = x;
  return c;
};

// How visible a node's bench is: it fades back while the node is down.
export function laneOpacity(rec, i, t) {
  let c = null;
  for (const x of rec.commands) if (x.t <= t && x.node === i && ["fail", "stop", "start"].includes(x.cmd)) c = x;
  if (!c) return 1;
  const f = Math.min(1, (t - c.t) / FADE_DOWN);
  return c.cmd === "start" ? 0.35 + 0.65 * f : 1 - 0.65 * f;
}

export function makeFail(k, P, parts) {
  const at = (pt) => k.iso(pt, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const D = (pts, style) => k.dotsSvg(pts, style);
  const lit = { tone: "lit", crease: "lo", lit: true };
  const plain = { tone: "hi", crease: "lo" };
  const dim = { tone: "lo", crease: "none" };
  const slab = (plan, z, h, style) => S(k.slabOf(plan, z, h, P, 2, Math.min(0.3, h / 3)), style);

  // where the client's connection meets a head: the middle of its far side
  const portOf = (i) => [HEAD.x + HEAD.w, LANE_Y[i] + 2, 8];
  const clientPort = [CLIENT.x, CLIENT.y + CLIENT.d / 2, 9];
  const along = (a, b, f) => a.map((v, j) => v + (b[j] - v) * f);
  const frameChip = (pt, style) => slab({ x: pt[0] - 1, y: pt[1] - 0.8, w: 2, d: 1.6, r: 0.3 }, pt[2] - 0.6, 1.2, style);
  const walChip = (pt, style) => slab({ x: pt[0] - 2.2, y: pt[1] - 2.2, w: 4.4, d: 4.4, r: 0.5 }, pt[2], 2.2, style);
  const slotOf = (rank) => [DECK.x + DECK.w - 7 - rank * 10, STORE_Y + 3, DECK_TOP];

  // the client: a box on feet with its store-and-forward ring on top, one cell per frame
  function clientSvg() {
    const { x, y, w, d, h } = CLIENT;
    let out = "";
    for (const [fx, fy] of [[x + 3, y + 3], [x + w - 3, y + 3], [x + 3, y + d - 3], [x + w - 3, y + d - 3]]) out += S(k.cylinder(fx, fy, 1.6, -10, 10, P, 18), { tone: "mid" });
    out += S(k.slabOf({ x, y, w, d, r: 1.5 }, 0, h, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam({ x, y, w, d, r: 1.5 }, 3.5, P, 3), { tone: "faint" }) });
    out += S(k.slabOf({ x: x + 1.5, y: y + 2, w: w - 3, d: d - 4, r: 0.6 }, h, 0.8, P, 2, 0.2), dim);
    out += S(k.cylinder(clientPort[0], clientPort[1], 1.5, 7.5, 3, P, 18), { tone: "mid" });
    return out;
  }
  function ringSvg(s) {
    const { x, y, d, h } = CLIENT;
    let out = "";
    const first = Math.max(s.acked + 1, s.produced - CELLS + 1);
    for (let c = 0; c < CELLS; c++) {
      const n = first + c;
      if (n > s.produced) break;
      const row = Math.floor(c / 30), col = c % 30;
      const cx = x + 1.9 + col * 0.88, cy = y + 3 + row * (d - 6) / 2;
      out += slab({ x: cx, y: cy, w: 0.72, d: (d - 6) / 2 - 0.4, r: 0.12 }, h + 0.8, 1.4, lit);
    }
    return out;
  }

  return function render(rec, t) {
    const s = snapAt(rec, t);

    // the connection: frames out, acks back; with no primary, probes to every host
    let wire = "";
    if (s.conn !== null) wire += L(k.segment(clientPort, portOf(s.conn), P), { tone: "mid" }) + D([at(clientPort), at(portOf(s.conn))], { size: 0.8, tone: "hi" });
    for (const f of rec.sends) {
      if (t < f.t || t > f.t + VIS.wire) continue;
      wire += frameChip(along(clientPort, portOf(f.to), (t - f.t) / VIS.wire), f.replay ? plain : lit);
    }
    const acks = [];
    for (const a of rec.acks) if (t >= a.t - VIS.ack && t <= a.t) acks.push(at(along(portOf(a.from), clientPort, 1 - (a.t - t) / VIS.ack)));
    const probes = [], flags = [];
    for (const a of rec.attempts) {
      if (t < a.t || t > a.t + 0.5) continue;
      const f = (t - a.t) / 0.5;
      probes.push(at(along(clientPort, portOf(a.host), f < 0.5 ? f * 2 : 2 - f * 2))); // there and back
      if (a.result !== "connected") flags.push(a);
    }
    if (acks.length) wire += D(acks, { size: 0.7, tone: "hi" });
    if (probes.length) wire += D(probes, { size: 0.9, tone: "hi" });

    // WAL through the store: uploads up from whoever is primary, downloads to the others
    let flying = "", bay = "";
    const landed = rec.ups.filter((u) => u.landed && u.land <= t).slice(-4);
    landed.forEach((u, j) => { bay += walChip(slotOf(landed.length - 1 - j), t - u.land < VIS.flash ? lit : plain); });
    for (const u of rec.ups) {
      if (!u.landed || t < u.land - VIS.upload || t > u.land) continue;
      flying += walChip(parts.flight(parts.PORT(u.from), slotOf(0), 1 - (u.land - t) / VIS.upload), lit);
    }
    for (const d of rec.downs) {
      const f = (t - d.t) / VIS.down;
      if (f >= 0 && f < 1) flying += walChip(parts.flight(slotOf(0), parts.PORT(d.node), f), plain);
    }
    const owned = rec.commands.find((c) => c.cmd === "owned" && t >= c.t && t < c.t + VIS.flash * 2);
    bay = slab({ x: CARDS.index.x, y: CARDS.index.y, w: 12, d: 1.4, r: 0.3 }, DECK_TOP, 10, owned ? lit : plain) + bay;

    // a primary that crashed: the transactions it committed but never uploaded stay behind
    // at its WAL port, where nothing will ever fetch them, until it is repaired
    let dead = "";
    const crash = rec.commands.find((c) => c.cmd === "fail");
    if (crash && t >= crash.t && s.roles[crash.node] === "down") {
      const [px, py] = parts.PORT(crash.node);
      for (let j = 0; j < rec.neverUploaded; j++) dead += frameChip([px - 4 + (j % 3) * 2.4, py + 4 + Math.floor(j / 3) * 2, HEAD.h + 0.6], dim);
    }

    // the words: each node's role and state, or the command just issued to it
    const W = [];
    const lab = (i) => [HEAD.x + HEAD.w, LANE_Y[i] + HEAD.d / 2, 4];
    const place = (i) => (i === 0 ? { anchor: "start", dx: -6, dy: 12, dy2: 23 } : { anchor: "start", dx: 8, dy: -2, dy2: 9 });
    const txn = (n) => (n < 0 ? "none" : (n + 1).toLocaleString("en-US"));
    for (const i of [0, 1, 2]) {
      const role = s.roles[i];
      const { anchor, dx, dy, dy2 } = place(i);
      const crashed = role === "down" && crash?.node === i;
      const head = role === "down" ? "DOWN" : role === "demoting" ? "PRIMARY › REPLICA" : role === "promoting" ? "REPLICA › PRIMARY" : role.toUpperCase();
      W.push(parts.label(lab(i), `${NODE_NAMES[i]} · ${head}${role === "down" ? "" : ` · txn ${txn(s.applied[i])}`}`, { anchor, dx, dy }));
      const c = lastCommand(rec, t, i);
      const fresh = c && c.cmd !== "owned" && t - c.t < VIS.command;
      const flagged = flags.find((a) => a.host === i);
      const sub = fresh ? null
        : crashed ? `${rec.neverUploaded} committed txns never uploaded`
        : role === "down" ? "down for maintenance"
        : role === "demoting" ? "refuses writes, uploads what is pending"
        : role === "promoting" ? (flagged ? "answers 421 PRIMARY_CATCHUP" : "catching up with the store")
        : role === "primary" ? `uploads every second · store at txn ${txn(s.store)}`
        : flagged ? "answers 421 REPLICA"
        : `follows ${s.roles.includes("primary") ? NODE_NAMES[s.owner].toLowerCase() : "the store"}`;
      W.push(fresh ? parts.label(lab(i), COMMANDS[c.cmd], { anchor, dx, dy: dy2 }) : parts.label(lab(i), sub, { anchor, dx, dy: dy2, sub: true }));
    }
    const cl = [CLIENT.x + CLIENT.w / 2, CLIENT.y + CLIENT.d, 0];
    W.push(parts.label(cl, `CLIENT · ${MODES[rec.mode].label}`, { dy: 14 }));
    W.push(parts.label(cl, `${s.produced - s.acked} unacknowledged frame${s.produced - s.acked === 1 ? "" : "s"} kept on disk`, { dy: 25, sub: true }));
    const bayAt = [(CARDS.index.x + DECK.x + DECK.w) / 2, DECK.y + DECK.d, DECK.z];
    W.push(parts.label(bayAt, `index.msgpack · sync_id ${s.syncId}`, { dy: 13 }));
    W.push(parts.label(bayAt, owned ? `claimed by ${NODE_NAMES[owned.node].toLowerCase()}` : `owned by ${NODE_NAMES[s.owner].toLowerCase()}`, { dy: 25, sub: true }));

    return { wire, flying, bay, dead, ring: ringSvg(s), labels: W.join(""), client: clientSvg(), state: s };
  };
}

// One line for the readout.
export function storyOf(rec, t) {
  const s = snapAt(rec, t);
  const name = (i) => NODE_NAMES[i].replace("NODE", "Node");
  const frames = (n) => `${n} frame${n === 1 ? "" : "s"}`;
  const unacked = frames(s.produced - s.acked);
  const ack = rec.mode === "durable" ? "after the upload" : "on commit";
  const c = lastCommand(rec, t);
  // the frames still to replay in this burst
  const backlog = rec.sends.filter((x) => x.replay && x.t > t && x.t < t + 3).length;
  const lastReplay = rec.sends.filter((x) => x.replay && x.t <= t).length;
  const noPrimary = !s.roles.includes("primary");
  const planned = rec.scenario === "planned";
  if (!c) return `Normal · ${name(0)} is primary and acknowledges ${ack} · ${unacked} waiting for an ack`;
  if (noPrimary && s.roles.includes("demoting")) return `SWITCH ROLE TO REPLICA on ${name(c.node)} · it refuses new writes and uploads what is pending`;
  if (noPrimary && s.roles.includes("promoting")) {
    const p = s.roles.indexOf("promoting");
    return `SWITCH ROLE TO PRIMARY on ${name(p)} · it applies everything in the store first`;
  }
  if (noPrimary) {
    const since = c.cmd === "fail" ? `${name(c.node)} crashed ${(t - c.t).toFixed(1)} s ago` : "No primary";
    return `${since} · the client keeps ${unacked} on disk and retries every host`;
  }
  if (s.conn === null) return `${name(s.owner)} owns the store, sync_id ${s.syncId} · the client is still backing off`;
  if (rec.sends.some((x) => x.replay && Math.abs(x.t - t) < 0.3)) {
    return `${name(s.owner)} is primary · the client replays ${frames(Math.max(1, backlog))} from its acknowledged watermark`;
  }
  if (c.cmd === "stop") return `${name(c.node)} restarts to apply an update · the cluster keeps running on ${name(s.owner)}`;
  if (c.cmd === "start" && t - c.t < 3) return `${name(c.node)} starts with replication.role=replica and catches up from the store`;
  if (planned && s.owner === 0 && lastReplay > 0) return `Back to normal · ${name(0)} is primary again · ${frames(lastReplay)} replayed across two switchovers, nothing lost`;
  if (planned) return `${name(s.owner)} is primary · ${name(0)} follows it as a replica`;
  if (c.cmd === "start" || c.cmd === "owned" || c.cmd === "promote") {
    const tail = rec.mode === "durable"
      ? `replayed ${frames(lastReplay)} · nothing lost`
      : `replayed ${frames(lastReplay)} · ${rec.lost.length} acknowledged frame${rec.lost.length === 1 ? "" : "s"} lost with ${name(0)}`;
    return `Recovered on ${name(s.owner)} · ${tail}`;
  }
  return `${name(s.owner)} is primary`;
}
