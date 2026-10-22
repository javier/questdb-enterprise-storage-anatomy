// Fig 10's moving parts at time u. Pure: keyed items for what slides (backup trays and the
// partition tiles on them), markup for the rest.
//
// The backup store is a stepped stand between the bench and the object store. Each kept
// backup is a tray on a step, the newest on the top step at the back, each older one a step
// lower and nearer; a partition's tile sits on the tray of the backup that last uploaded
// it, at the same x as the partition on the bench, so a column down the steps reads one
// partition's history, and a tray with three tiles is still a complete backup, because its
// manifest points at every other tile. The bottom step holds the objects of swept backups
// that a kept manifest still references.
// The WAL lies on a tape along the front of the object store, from now back to the oldest
// kept backup, which is as far as point-in-time recovery reaches.

import { BENCH, DECK, FLOOR, LANE_Y, RULER, X_END, X_NOW, axisOf } from "../fig1/parts.mjs";
import { WAL, nameOf, partitionsAt } from "../fig1/model.mjs";
import { CLEANER, GRAIN, backupStats, frameOf, holderOf, stateOf } from "./backup.mjs";

// The stand fills the slots where Fig 6's replicas stand, so Fig 10 seats its replica on a
// bench in front of the primary and moves the ruler in front of that. Every figure runs
// its own copy of the shared modules, so this changes no other figure.
export const REPLICA_Y = 100;
LANE_Y[1] = REPLICA_Y;
RULER.y = REPLICA_Y + BENCH.d / 2 + 4;
// the primary and its replica; the primary is also the cold storage manager here
export const C6 = { lanes: [0, 1], manager: 0 };

// the object store, deeper than Fig 2's, with the WAL tape along its front
export const STORE6 = { ...DECK, d: 42 };
export const WAL_Y = STORE6.y + STORE6.d - 7;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
// the backup store: seven steps, top and back first
export const STAND = { x: X_END - 9, w: X_NOW - X_END + 19, y0: -61, stepY: 7.4, z0: 37, stepZ: 5, steps: 7 };
export const BACK = 6; // the step of older objects, below the kept trays
const stepAt = (i) => ({ y: STAND.y0 + STAND.stepY * (i + 0.5), z: STAND.z0 - STAND.stepZ * i });
// where a tray sits for a position: between steps it moves forward first, then drops
export function rowAt(pos) {
  const i = Math.max(0, Math.min(STAND.steps - 1, Math.floor(pos))), f = pos - i;
  const a = stepAt(i), b = stepAt(Math.min(STAND.steps - 1, i + 1));
  const fy = f <= 0 ? 0 : f >= 1 ? 1 : ease(Math.min(1, f * 2)), fz = ease(Math.max(0, f * 2 - 1));
  return { y: a.y + (b.y - a.y) * fy, z: a.z + (b.z - a.z) * fz };
}
const TILE_HALF = 2.6;
const TRAY_H = 0.6;

export function makeBackups(k, P, parts) {
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const D = (pts, style) => k.dotsSvg(pts, style);
  const at = (pt) => k.iso(pt, P);
  const slab = (plan, z, h, style, steps = 2, bevel = 0.2) => S(k.slabOf(plan, z, h, P, steps, Math.max(0.05, Math.min(bevel, h / 3, plan.w / 3))), style);
  const PQ = { tone: "blue", crease: "lo", className: "sa-pq" };
  const PM = { tone: "blue", crease: "lo", className: "sa-pm" };

  // One partition as a backup holds it, built at x 0..len, around y 0, from z 0.
  // native: its column files; parquet: data.parquet and _pm; cold: _pm and the index only,
  // the outline marking the data that stays in cold storage.
  function tileSvg(len, form, lit) {
    const hi = { tone: "hi", crease: "lo", lit };
    if (len < 1.6) return slab({ x: 0.15, y: -TILE_HALF + 0.3, w: Math.max(0.3, len - 0.3), d: 2 * TILE_HALF - 0.6, r: 0.1 }, 0, form === "cold" ? 1.2 : 1.8, form === "native" ? hi : { ...(form === "cold" ? PM : PQ), lit });
    const x0 = 0.3, x1 = len - 0.3;
    if (form === "native") {
      let seams = "";
      for (const y of [-1.1, 0, 1.1]) seams += k.lineOnTop([x0 + 0.4, y], [x1 - 0.4, y], 2.2, P);
      return S(k.slabOf({ x: x0, y: -TILE_HALF + 0.3, w: x1 - x0, d: 2 * TILE_HALF - 0.6, r: 0.3 }, 0, 2.2, P, 2, 0.2), { ...hi, inner: len >= 6 ? L(seams, { tone: "lo" }) : "" });
    }
    const pmW = Math.min(1.4, (x1 - x0) * 0.3);
    if (form === "parquet") {
      return slab({ x: x0, y: -TILE_HALF + 0.3, w: x1 - x0 - pmW - 0.3, d: 2 * TILE_HALF - 0.6, r: 0.3 }, 0, 1.6, { ...PQ, lit }) +
        slab({ x: x1 - pmW, y: -TILE_HALF + 0.3, w: pmW, d: 2 * TILE_HALF - 0.6, r: 0.2 }, 0, 2.4, { ...PM, lit });
    }
    return L(k.planOutline({ x: x0, y: -TILE_HALF + 0.3, w: x1 - x0 - pmW - 0.3, d: 2 * TILE_HALF - 0.6, r: 0.3 }, 0.05, P, 2), { tone: lit ? "hi" : "lo" }) +
      slab({ x: x0, y: -TILE_HALF + 0.3, w: x1 - x0 - pmW - 0.3, d: 1, r: 0.2 }, 0, 1.2, hi) +
      slab({ x: x1 - pmW, y: -TILE_HALF + 0.3, w: pmW, d: 2 * TILE_HALF - 0.6, r: 0.2 }, 0, 2.4, { ...PM, lit });
  }
  // The stand: a step per tray on a plinth, each step a box from the floor, back first.
  function standSvg() {
    const out = [];
    const { x, w } = STAND;
    const front = STAND.y0 + STAND.stepY * STAND.steps;
    const plinth = { x: x - 2, y: STAND.y0 - 2, w: w + 4, d: front - STAND.y0 + 4, r: 1.4 };
    out.push(`<path class="iso-halo" d="${k.haloOf(plinth, FLOOR, 2, P)}"/>`);
    out.push(slab(plinth, FLOOR, 2, { tone: "lo" }, 3, 0.4));
    for (let i = 0; i < STAND.steps; i++) {
      const { z } = stepAt(i);
      const plan = { x, y: STAND.y0 + STAND.stepY * i, w, d: STAND.stepY, r: 0.6 };
      out.push(S(k.slabOf(plan, FLOOR + 2, z - FLOOR - 2, P, 2, 0.4), { tone: "mid", inner: L(k.sideSeam(plan, z - 1.6, P, 2), { tone: "faint" }) }));
      // a lip along the front of each step, and screws at its ends
      out.push(L(k.lineOnTop([x + 1.6, plan.y + plan.d - 0.9], [x + w - 1.6, plan.y + plan.d - 0.9], z, P), { tone: "faint" }));
      out.push(D([at([x + 1.2, plan.y + plan.d / 2, z]), at([x + w - 1.2, plan.y + plan.d / 2, z])], { size: 0.42 }));
    }
    // the name, engraved on the front of the bottom step
    out.push(k.faceTextSvg(k.sideMatrix([x + 8, front], FLOOR + 6, P, "left"), "BACKUP STORE · backup/{instance}/", { size: 4.4, tone: "hi" }));
    return out.join("");
  }
  // A tray for one backup: a flat strip under the bench's whole axis, with a tab at the end.
  // x0, x1: its span, the whole axis unless the legend asks for a short one
  function traySvg(lit, { x0 = X_END - 6, x1 = X_NOW + 8 } = {}) {
    const tone = { tone: lit ? "mid" : "lo", crease: "none", lit };
    return slab({ x: x0, y: -TILE_HALF - 0.6, w: x1 - x0, d: 2 * TILE_HALF + 1.2, r: 0.8 }, 0, TRAY_H, tone, 2, 0.2) +
      slab({ x: x1 - 5, y: -TILE_HALF + 0.4, w: 4, d: 2 * TILE_HALF - 0.8, r: 0.5 }, TRAY_H, 1.6, { tone: "mid", crease: "lo", lit });
  }

  const q = (x) => Math.round(x * 5) / 5;

  // hovered: { p } a partition, or { row: backup time } a backup
  // opts.failed: backup times that failed; opts.outage: { from, to, catchUp }, the object store
  // unreachable from `from` to `to`, then `catchUp` long to work off the backlog (Fig 9)
  function render(u, keep, manual = [], hovered = null, opts = {}) {
    const { xOfAge } = axisOf(GRAIN);
    const F = frameOf(u, keep, manual, opts.failed ?? []);
    // how far the WAL in the store reaches: during an outage it stops where the outage began,
    // and the backlog then fills the gap during the catch-up
    const out = opts.outage;
    const walTo = !out || u < out.from ? u : u < out.to ? out.from : u < out.to + out.catchUp ? out.from + (u - out.from) * ((u - out.to) / out.catchUp) : u;
    const { list, latest, running, done, kept, swept } = F;
    const ps = partitionsAt(GRAIN, u);
    const spanOf = (p, rows = 1) => {
      const open = u < p + 1;
      const x0 = xOfAge(u - p), x1 = open ? X_NOW : xOfAge(u - p - rows);
      const gap = Math.min(0.8, (x1 - x0) * 0.1);
      return { left: x0 + gap, len: x1 - x0 - (open ? gap : 2 * gap) };
    };
    // what is lit: a hovered backup lights every tile its manifest names
    const hj = hovered?.row !== undefined ? list.findIndex((t) => Math.abs(t - hovered.row) < 1e-6) : -1;
    const litTile = (p, h) => (hovered?.p === p && (holderOf(p, kept[0] ?? done, list) === h)) || (hj >= 0 && holderOf(p, hj, list) === h);

    // where each backup's tray sits: kept ones at 0..keep-1, a running one slides in at 0
    const posOf = (j) => (running !== null ? done - j + ease(F.shift) : latest - j);
    const rows = [], tiles = [];
    const oldest = kept[kept.length - 1];
    const trayItem = (j, pos, opacity = 1) => rows.push({ id: "r" + list[j], row: list[j], x: 0, ...rowAt(pos), opacity, key: hj === j ? "lit" : "", html: () => traySvg(hj === j) });
    const tileItem = (p, h, pos, opacity = 1) => {
      const s = stateOf(p, list[h]);
      const { left, len } = spanOf(p, s.rows);
      if (len < 0.4) return;
      const lit = litTile(p, h);
      const r = rowAt(pos);
      tiles.push({ id: `t${list[h]}:${p}`, p, x: left, y: r.y, z: r.z + TRAY_H, opacity, key: [q(len), s.form, lit ? 1 : 0].join(), html: () => tileSvg(q(len), s.form, lit) });
    };
    let flying = "";
    if (running !== null) {
      trayItem(latest, 0, ease(F.shift));
      for (const p of ps) {
        if (holderOf(p, latest, list) !== latest) continue;
        // up from the bench, across, down onto the new tray
        const f = ease(running);
        const s = stateOf(p, list[latest]);
        const { left, len } = spanOf(p, s.rows);
        if (len < 0.4) continue;
        const r0 = rowAt(0);
        const [, y, z] = parts.flight([left, LANE_Y[0], 2], [left, r0.y, r0.z + TRAY_H], f);
        flying += `<g data-p="${p}" transform="${k.translateAlong(P, [left, y, z])}">${tileSvg(q(len), s.form, false)}</g>`;
      }
    }
    for (const j of kept) {
      trayItem(j, posOf(j));
      for (const p of ps) if (holderOf(p, j, list) === j) tileItem(p, j, posOf(j));
    }
    // the older objects still referenced by the oldest kept manifest
    for (const p of ps) {
      const h = holderOf(p, oldest, list);
      if (h < 0 || h >= oldest) continue;
      if (swept && h === swept.j) tileItem(p, h, posOf(h) + (BACK - posOf(h)) * ease(swept.f));
      else tileItem(p, h, BACK);
    }
    // retention sweeping the backup that fell out: its own tiles that nothing references
    // any more are deleted, and so are older objects only it still pointed at
    if (swept) {
      const s = swept.j, fade = 1 - ease(swept.f);
      trayItem(s, posOf(s), fade);
      for (const p of ps) {
        const hs = holderOf(p, s, list), ho = holderOf(p, oldest, list);
        if (hs < 0 || hs === ho) continue;
        tileItem(p, hs, hs === s ? posOf(s) : BACK, fade);
      }
    }
    rows.sort((a, b) => a.y - b.y || b.z - a.z);
    tiles.sort((a, b) => a.y - b.y || b.z - a.z);

    // The WAL tape: from the cleaner's boundary to now, with a tick per segment where they
    // fit and a pin at every kept backup. A prune fades the stretch it deletes.
    const z = STORE6.z + STORE6.t;
    const xb = xOfAge(u - F.boundary);
    const tape = (xa, xc, lit) => slab({ x: xa, y: WAL_Y - 2.2, w: Math.max(0.3, xc - xa), d: 4.4, r: 0.4 }, z, 1.2, { tone: "hi", crease: "lo", lit }, 2, 0.2);
    let wal = slab({ x: X_END - 6, y: WAL_Y - 3, w: X_NOW - X_END + 9, d: 6, r: 0.8 }, z, 0.4, { tone: "lo", crease: "none" });
    // a hovered backup lights the WAL that rolls it forward: to now, or to hovered.to
    const litFrom = hj >= 0 ? Math.max(xb, xOfAge(u - list[hj])) : null;
    const litTo = hj >= 0 && hovered.to !== undefined ? Math.max(litFrom, xOfAge(u - hovered.to)) : X_NOW;
    const xTo = xOfAge(u - walTo);
    if (litFrom === null) wal += tape(xb, xTo, false);
    else {
      if (litFrom > xb + 0.3) wal += tape(xb, litFrom, false);
      wal += tape(litFrom, litTo, true);
      if (litTo < X_NOW - 0.3) wal += tape(litTo, X_NOW, false);
    }
    if (F.prune) {
      const xa = xOfAge(u - F.prune.from), xc = xOfAge(u - F.prune.to);
      wal += `<g opacity="${(1 - ease(F.prune.f)).toFixed(2)}">${tape(xa, xc, false)}</g>`;
    }
    const ticks = [];
    let last = -Infinity;
    for (let n = 1; n < 24 * 8; n++) {
      const x = xOfAge((u % (1 / 24)) + (n - 1) / 24);
      if (x < xb + 0.5) break;
      if (Math.abs(x - last) < 1.3) continue;
      ticks.push(k.lineOnTop([x, WAL_Y - 1.8], [x, WAL_Y + 1.8], z + 1.2, P));
      last = x;
    }
    wal += L(ticks.join(""), { tone: "lo" });
    const pins = kept.map((j) => xOfAge(u - list[j])).filter((x) => x >= xb - 0.1);
    for (const x of pins) wal += slab({ x: x - 0.6, y: WAL_Y + 2.4, w: 1.2, d: 1.2, r: 0.3 }, z, 2.6, { tone: "mid", crease: "lo" });
    // WAL segments leaving the primary for the store, as in Fig 6, every second or so, and
    // the replica fetching each one moments after it lands
    // In an outage each upload climbs, fails and falls back to retry; after it, the backlog
    // goes up at four times the pace and the replica downloads as fast.
    const down = out && u >= out.from && u < out.to;
    const catching = out && u >= out.to && u < out.to + out.catchUp;
    const period = catching ? WAL.period / 4 : WAL.period;
    const n1 = Math.floor(u / period);
    const end = [Math.min(X_NOW - 2, xTo), WAL_Y, z + 1.2];
    for (let s0 = n1; s0 > n1 - 8; s0--) {
      const t0 = s0 * period;
      const f = (u - t0) / WAL.up;
      if (f >= 0 && f < 1) {
        if (down) {
          const [x, y] = parts.PORT(0);
          const h = f < 0.5 ? f * 2 : 2 - f * 2; // up towards the store, and back
          flying += parts.chipSvg([x, y, parts.PORT(0)[2] + 22 * h], false);
        } else flying += parts.chipSvg(parts.flight(parts.PORT(0), end, f), false);
      }
      const g = (u - t0 - WAL.up - WAL.wait[1]) / WAL.down;
      if (!down && g >= 0 && g < 1) flying += parts.chipSvg(parts.flight(end, parts.PORT(1), g), false);
    }

    // words at the end of the trays and of the tape
    const day = (t) => nameOf(GRAIN, t + 1e-6).slice(5) + (Math.abs(t - Math.round(t)) < 1e-6 ? " 00:00" : "");
    const W = [];
    const tag = (pos, s, sub = false) => { const r = rowAt(pos); W.push(parts.label([STAND.x + STAND.w, r.y, r.z], s, { anchor: "start", dx: 6, dy: 3, sub })); };
    if (running !== null) tag(0, `BACKUP ${day(list[latest])} · RUNNING`);
    if (running !== null) { const r = rowAt(0); W.push(parts.label([STAND.x + STAND.w, r.y, r.z], "uploads only what changed", { anchor: "start", dx: 6, dy: 13, sub: true })); }
    else if (kept.length) {
      const s0 = backupStats(kept[0], list, ps);
      tag(0, `NEWEST · ${day(list[kept[0]])}`);
      { const r = rowAt(0); W.push(parts.label([STAND.x + STAND.w, r.y, r.z], `${s0.up} uploaded, ${s0.ref} referenced`, { anchor: "start", dx: 6, dy: 13, sub: true })); }
    }
    if (kept.length > 1) tag(posOf(oldest), `OLDEST KEPT · ${day(list[oldest])}`);
    tag(BACK, "OLDER OBJECTS · still referenced", true);
    W.push(parts.label([X_NOW + 8, WAL_Y, z], "WAL SEGMENTS", { anchor: "start", dx: 4, dy: -4 }));
    W.push(parts.label([X_NOW + 8, WAL_Y, z], `back to ${day(F.boundary)}`, { anchor: "start", dx: 4, dy: 6, sub: true }));
    return { F, rows, tiles, flying, wal, labels: W.join(""), stats: (j) => backupStats(j, list, ps) };
  }
  // the legend draws the same parts
  return Object.assign(render, { tileSvg, traySvg, standSvg });
}

// One line for the readout. clock(t) names a moment. A backup takes minutes; the figure
// draws it slowed, so the readout names the moment it ran rather than the running clock.
export function storyOf(u, keep, manual, hovered, clock) {
  const F = frameOf(u, keep, manual);
  const { list, kept, running, latest } = F;
  const ps = partitionsAt(GRAIN, u);
  const day = (t) => nameOf(GRAIN, t + 1e-6) + (Math.abs(t - Math.round(t)) < 1e-6 ? " 00:00" : "");
  const plural = (n, s) => `${n} ${s}${n === 1 ? "" : "s"}`;
  if (hovered?.row !== undefined) {
    const j = list.findIndex((t) => Math.abs(t - hovered.row) < 1e-6);
    if (j >= 0) {
      const s = backupStats(j, list, ps);
      return `Backup ${day(list[j])} · ${plural(s.up, "partition")} uploaded, ${s.ref} referenced in ${plural(s.prefixes - 1, "older backup")} · restore it, then replay WAL to any moment since`;
    }
  }
  if (hovered?.p !== undefined && ps.includes(hovered.p) && kept.length) {
    const p = hovered.p;
    const h = holderOf(p, kept[0], list);
    const s = stateOf(p, u);
    if (h < 0 || !s) return `${nameOf(GRAIN, p)} · active · in no backup yet, only in the WAL`;
    const where = kept.includes(h) ? `the backup of ${day(list[h])}` : `an older backup, ${day(list[h])}, kept while referenced`;
    const form = stateOf(p, list[h]).form;
    return `${nameOf(GRAIN, p)} · held as ${form === "cold" ? "_pm and index only, data in cold storage" : form} by ${where} · every later backup points at it`;
  }
  if (running !== null) {
    const s = backupStats(latest, list, ps);
    return `${clock(list[latest])} · BACKUP DATABASE · checkpoint, diff against the last manifest, upload ${plural(s.up, "changed partition")}`;
  }
  if (F.swept) return `${clock(list[F.done])} · keeping the latest ${keep} · retention sweeps the backup of ${day(list[F.swept.j])} and every object no kept manifest references`;
  if (F.prune) return `${clock(list[F.done] + CLEANER)} · the WAL cleaner deletes WAL up to the oldest kept backup, ${day(F.prune.to)}`;
  const next = Math.floor(u) + 1 - u;
  return `${clock(u)} · next backup in ${Math.ceil(next * 24)}h · WAL kept back to ${day(F.boundary)}, the oldest of ${keep} backups`;
}
