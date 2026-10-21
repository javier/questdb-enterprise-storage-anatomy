// The model behind Fig 5: failover with a store-and-forward client, as a small scripted
// simulation. The client, the three nodes and the object store follow their own rules;
// an operator's commands are the script. Each run is recorded once, so the drawing is a
// pure function of time and the loop replays it exactly.
//
// From the failover, SWITCH ROLE, client failover and store-and-forward docs, and the
// uploader (wal/uploader/indexer.rs):
//   - The client keeps every frame it has not had acknowledged in its store-and-forward
//     ring. Plain ACK: acknowledged once committed to the primary's WAL. Durable ACK
//     (request_durable_ack=on): only once that WAL is in the object store.
//   - The primary uploads every throttle window (1 s, the default); replicas poll the
//     index every second and apply what landed.
//   - SWITCH ROLE TO REPLICA refuses new writes, drains writers, uploads what is still
//     pending, and becomes a replica that follows the store. It never abandons committed
//     transactions. A QWP client is closed on its first refused frame, after its durable
//     acks have been flushed; that frame is replayed later.
//   - SWITCH ROLE TO PRIMARY is accepted once the node has applied everything in the store;
//     until then it answers 421 PRIMARY_CATCHUP. It claims the store by writing
//     index.msgpack with the next sync_id.
//   - A primary that dies takes its unuploaded transactions with it. Once repaired it is
//     started with replication.role=replica and rejoins as a replica.
//   - The client walks its host list with backoff (100 ms doubling, at most 5 s): a replica
//     answers 421 REPLICA, a node that is down does not answer. After connecting it replays
//     everything past its acknowledged watermark. A frame already in the store arrives
//     twice, and DEDUP drops it.

export const RATE = 0.1; // a frame every 100 ms
export const WINDOW = 1; // throttle window, the default
export const UPLOAD = 0.15;
export const NET = 0.05;
export const POLL = 1;
const PHASE = [0, 0.08, 0.17]; // each node polls on its own clock
export const REPLAY_GAP = 0.025; // the backlog goes out back to back
export const RESTART = 3; // seconds a node is down for maintenance or repair
export const SYNC_ID = 42;
const STEP = 0.01;

export const VIS = { wire: 0.35, ack: 0.3, upload: 0.45, down: 0.4, flash: 0.6, command: 2.2 };

export const MODES = {
  durable: { label: "DURABLE ACK", note: "acknowledged once the WAL is in the object store" },
  plain: { label: "PLAIN ACK", note: "acknowledged once committed to the primary's WAL" },
};
export const MODE_ORDER = ["durable", "plain"];

// The operator's script for each scenario: [time, command, node].
export const SCENARIOS = {
  planned: {
    label: "PLANNED SWITCHOVER",
    loop: 32,
    script: [
      [6, "demote", 0],
      [8, "promote", 1],
      [13, "stop", 0], // maintenance: a restart to apply an update
      [13 + RESTART, "start", 0], // back as a replica (replication.role=replica)
      [21, "demote", 1],
      [23, "promote", 0],
    ],
  },
  unplanned: {
    label: "UNPLANNED FAILURE",
    loop: 28,
    script: [
      [7.88, "fail", 0], // late in a throttle window, so its last commits are in no upload
      [11, "promote", 1],
      [19, "start", 0], // repaired, started with replication.role=replica
    ],
  },
};
export const SCENARIO_ORDER = ["planned", "unplanned"];

export function simulate(scenarioKey, mode) {
  const sc = SCENARIOS[scenarioKey];
  const loop = sc.loop;
  const nodes = [0, 1, 2].map((i) => ({ i, role: i === 0 ? "primary" : "replica", applied: -1, committed: new Set(), pendingFrom: null, lastUp: -1 }));
  const store = { high: -1 };
  let syncId = SYNC_ID, owner = 0;
  const rec = { frames: [], sends: [], acks: [], ups: [], downs: [], attempts: [], commands: [], snaps: [], dups: [], lost: [], neverUploaded: 0, refused: [] };
  const client = { conn: null, sentTo: -1, acked: -1, nextTry: null, backoff: 0.1, plainAcked: new Set(), lastSend: undefined };
  const pendingAcks = []; // { t, n, from, cumulative }
  const inflight = []; // frames on the wire: { n, to, arrive }
  const script = [...sc.script];

  // frames arrive in order on one connection, so a node's highest commit is its tip; a gap
  // below it is frames lost with a failed primary, never to be filled
  const highCommitted = (node) => { let h = store.high; for (const x of node.committed) h = Math.max(h, x); return h; };
  const durable = new Set(); // frames that reached the object store
  const commitOn = (node, n, t) => {
    if (store.high >= n || node.committed.has(n)) { rec.dups.push({ n, t, at: node.i }); return "dup"; }
    node.committed.add(n);
    if (node.pendingFrom === null) node.pendingFrom = t;
    if (mode === "plain") pendingAcks.push({ t: t + NET, n, from: node.i });
    return "ok";
  };
  const upload = (node, t) => {
    const to = highCommitted(node);
    if (to <= Math.max(node.lastUp, store.high)) return null;
    const u = { t0: t, land: t + UPLOAD, to, from: node.i };
    node.lastUp = to;
    node.pendingFrom = null;
    rec.ups.push(u);
    return u;
  };
  const close = (t) => { client.conn = null; client.nextTry = t + NET; client.backoff = 0.1; };
  let replayTo = -1; // the last frame buffered when the client reconnected
  const isReplay = (x) => x <= replayTo;

  // the client connects to the primary at the start
  client.conn = 0;
  for (let k = 0; k <= Math.round(loop / STEP); k++) {
    const t = Math.round(k * STEP * 100) / 100;
    // the operator
    while (script.length && script[0][0] <= t + 1e-9) {
      const [, cmd, i] = script.shift();
      const node = nodes[i];
      rec.commands.push({ t, cmd, node: i });
      if (cmd === "demote") { node.role = "demoting"; const u = upload(node, t); node.drainUntil = (u ? u.land : t) + 2 * NET; }
      if (cmd === "promote") { node.role = "promoting"; node.promoteAt = t; }
      if (cmd === "fail") {
        node.role = "down";
        rec.neverUploaded = highCommitted(node) - store.high;
        rec.failedCommits = highCommitted(node);
        rec.ups = rec.ups.filter((u) => !(u.from === i && u.land > t)); // a dying primary finishes nothing
        node.committed = new Set();
        node.pendingFrom = null;
        if (client.conn === i) close(t);
      }
      if (cmd === "stop") node.role = "down";
      if (cmd === "start") { node.role = "replica"; node.committed = new Set(); node.pendingFrom = null; }
    }
    // uploads landing
    for (const u of rec.ups) {
      if (u.landed || u.land > t + 1e-9) continue;
      u.landed = true;
      store.high = Math.max(store.high, u.to);
      for (const x of nodes[u.from].committed) if (x <= u.to) durable.add(x);
      if (mode === "durable") pendingAcks.push({ t: t + NET, n: u.to, from: u.from, cumulative: true });
    }
    for (const node of nodes) {
      // a demoting primary closes its client once its durable acks are out, then follows the store
      if (node.role === "demoting" && t >= node.drainUntil - 1e-9) {
        node.role = "replica";
        node.applied = Math.max(node.applied, store.high);
        if (client.conn === node.i) close(t);
      }
      // a promotion completes once the node has applied everything in the store
      if (node.role === "promoting" && node.applied >= store.high && t >= node.promoteAt + 0.3 - 1e-9) {
        node.role = "primary";
        node.lastUp = store.high;
        syncId++;
        owner = node.i;
        rec.commands.push({ t, cmd: "owned", node: node.i });
      }
      // the primary's throttle window
      if (node.role === "primary" && node.pendingFrom !== null && t - node.pendingFrom >= WINDOW - 1e-9) upload(node, t);
      // replicas, and a node catching up for promotion, poll the index on their own clock
      const onPoll = Math.abs(((t - PHASE[node.i]) / POLL) - Math.round((t - PHASE[node.i]) / POLL)) < STEP / 2;
      if ((node.role === "replica" || node.role === "promoting") && onPoll && store.high > node.applied) {
        rec.downs.push({ t, node: node.i, to: store.high });
        node.applied = store.high;
      }
    }
    // the client produces a frame every RATE
    if (Math.abs(t / RATE - Math.round(t / RATE)) < STEP / RATE / 2) rec.frames.push({ n: rec.frames.length, p: t });
    // frames arriving at a node
    for (const f of inflight) {
      if (f.done || f.arrive > t + 1e-9) continue;
      f.done = true;
      const node = nodes[f.to];
      if (node.role === "primary") f.result = commitOn(node, f.n, t);
      else {
        f.result = "refused";
        rec.refused.push({ n: f.n, t, at: f.to });
        if (client.conn === f.to && node.role !== "demoting") close(t);
      }
    }
    // acks arriving at the client: plain ones per frame, durable ones cumulative per upload
    for (const a of pendingAcks) {
      if (a.done || a.t > t + 1e-9) continue;
      a.done = true;
      if (nodes[a.from].role === "down") continue; // it never left
      rec.acks.push({ t: a.t, from: a.from });
      if (a.cumulative) client.acked = Math.max(client.acked, a.n);
      else { client.plainAcked.add(a.n); while (client.plainAcked.has(client.acked + 1)) client.acked++; }
    }
    // the client's connection: send what has not been sent on it, or try to reconnect
    if (client.conn !== null && nodes[client.conn].role === "down") close(t);
    if (client.conn !== null && nodes[client.conn].role !== "demoting") {
      const last = rec.frames.length - 1;
      const gap = client.sentTo + 1 <= last && isReplay(client.sentTo + 1) ? REPLAY_GAP : 0;
      if (client.sentTo < last && (client.lastSend === undefined || t - client.lastSend >= gap - 1e-9)) {
        client.sentTo++;
        client.lastSend = t;
        inflight.push({ n: client.sentTo, to: client.conn, arrive: t + NET });
        rec.sends.push({ n: client.sentTo, to: client.conn, t, replay: isReplay(client.sentTo) });
      }
    } else if (client.conn === null && client.nextTry !== null && t >= client.nextTry - 1e-9) {
      let connected = false, transient = false;
      for (const node of nodes) {
        const result = node.role === "primary" ? "connected" : node.role === "down" ? "no answer" : node.role === "promoting" ? "PRIMARY_CATCHUP" : "REPLICA";
        rec.attempts.push({ t, host: node.i, result });
        if (result === "connected") { client.conn = node.i; client.sentTo = client.acked; client.lastSend = undefined; replayTo = rec.frames.length - 1; connected = true; break; }
        if (result === "PRIMARY_CATCHUP") transient = true;
      }
      if (!connected) {
        client.nextTry = t + (transient ? 0.2 : client.backoff);
        if (!transient) client.backoff = Math.min(5, client.backoff * 2);
      }
    }
    // a snapshot for the drawing, every 50 ms
    if (k % 5 === 0) {
      rec.snaps.push({
        t, roles: nodes.map((x) => x.role), applied: nodes.map((x) => (x.role === "primary" || x.role === "demoting" ? highCommitted(x) : x.applied)),
        store: store.high, syncId, owner, conn: client.conn, acked: client.acked, produced: rec.frames.length - 1,
      });
    }
  }
  // with plain ACK, frames acknowledged but never in the store, or anywhere else, are lost
  const final = rec.snaps[rec.snaps.length - 1];
  const kept = new Set(durable);
  for (const nd of nodes) for (const x of nd.committed) kept.add(x);
  for (let x = 0; x <= final.acked; x++) if (!kept.has(x)) rec.lost.push(x);
  rec.loop = loop;
  rec.scenario = scenarioKey;
  rec.mode = mode;
  return rec;
}

// The snapshot nearest to time t.
export const snapAt = (rec, t) => rec.snaps[Math.max(0, Math.min(rec.snaps.length - 1, Math.round(t / 0.05)))];
