// Late writes, for Fig 1. Pure: everything is a function of the grain and the time u.
//
// From the cold storage docs (concepts/cold-storage.md, "Immutability after DROP LOCAL"):
//   - Before DROP LOCAL seals a partition, an out-of-order write can still land in it. If it
//     has already been uploaded, QuestDB invalidates the uploaded copy and schedules a
//     replacement upload, so the copy in cold storage never drifts from the table.
//   - After the seal the partition is read-only: writes that target it are skipped at apply
//     time, not rejected at insert time.
// Every LATE.every partitions two late rows arrive: one for a partition that is uploaded but
// not sealed, which lands and is uploaded again, and later one for a sealed partition, which
// is skipped.

import { ANIM, SINGLE, eventsOf, nameOf, nominal } from "./model.mjs";
import { DECK_TOP, FEED, LANE_Y, STORE_Y, X_NOW, axisOf } from "./parts.mjs";

export const LATE = { every: 4, open: 0.55, sealed: 2.55, travel: 0.36, flash: 0.22 };
const LATE_M = SINGLE.manager; // the instance that uploads, in Fig 1 the primary

// The two targets for the cycle that holds u, and when each row is sent.
function cycleOf(g, u) {
  const n = Math.floor(u / LATE.every);
  const t0 = n * LATE.every;
  const now = (t) => Math.floor(t);
  const openAge = Math.max(2, Math.round(nominal(g)[1] * 0.7)), sealedAge = Math.round(nominal(g)[2] * 1.35);
  return [
    { kind: "open", sent: t0 + LATE.open, p: now(t0 + LATE.open) - openAge },
    { kind: "sealed", sent: t0 + LATE.sealed, p: now(t0 + LATE.sealed) - sealedAge },
  ];
}

// What is happening with late rows at u: the row in flight, where it is going, and whether
// the target's copy in cold storage is being replaced.
export function lateAt(g, u) {
  for (const ev of cycleOf(g, u)) {
    const f = (u - ev.sent) / LATE.travel;
    if (f < 0) continue;
    const e = eventsOf(g, ev.p, SINGLE);
    const sealed = u >= e.sealIn[LATE_M];
    const landed = ev.sent + LATE.travel;
    const end = ev.kind === "open" ? landed + LATE.flash + ANIM.lift : landed + LATE.flash * 2;
    if (u > end) continue;
    return { ...ev, f: Math.min(1, f), landed, sealed, after: u - landed, replacing: ev.kind === "open" && u >= landed && u < end };
  }
  return null;
}

export function makeLate(k, P, parts) {
  const ease = (x) => x * x * (3 - 2 * x);
  const rowSvg = (pt, opacity) => `<g opacity="${opacity.toFixed(2)}">${parts.slab({ x: pt[0] - 0.9, y: pt[1] - 1.1, w: 1.8, d: 2.2, r: 0.3 }, pt[2], 1.3, { tone: "lit", crease: "lo", lit: true }, 2, 0.2)}</g>`;
  const along = (route, s) => {
    const lens = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i][0], p[1] - route[i][1], p[2] - route[i][2]));
    let d = s * lens.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i]) return route[i].map((v, j) => v + (route[i + 1][j] - v) * (d / lens[i]));
      d -= lens[i];
    }
    return route[route.length - 1];
  };
  // where partition p sits on the bench at u
  const spanAt = (g, p, u) => {
    const { xOfAge: x } = axisOf(g);
    const x0 = x(u - p), x1 = x(u - p - 1);
    const gap = Math.min(0.8, (x1 - x0) * 0.1);
    return { left: x0 + gap, len: x1 - x0 - 2 * gap };
  };

  // The late row's markup, and the replacement upload's, at u.
  return function render(g, u) {
    const ev = lateAt(g, u);
    if (!ev) return { html: "", ev: null };
    const { left, len } = spanAt(g, ev.p, u);
    const cx = left + len / 2;
    const route = [[FEED.x1 - 1.6, FEED.y, FEED.z], [FEED.x0, FEED.y, FEED.z], [X_NOW, LANE_Y[0], 16], [cx, LANE_Y[0], 16], [cx, LANE_Y[0], 9.6]];
    let html = "";
    if (ev.f < 1) html += rowSvg(along(route, ease(ev.f)), 1);
    else if (ev.kind === "sealed") {
      // skipped: it rises off the sealed partition and fades
      const s = Math.min(1, ev.after / (LATE.flash * 2));
      html += rowSvg([cx, LANE_Y[0], 9.6 + 6 * ease(s)], 1 - s);
    } else if (ev.after >= LATE.flash) {
      // the replacement upload, along the same path as the first one
      const s = Math.min(1, (ev.after - LATE.flash) / ANIM.lift);
      const [, y, z] = parts.flight([left, LANE_Y[LATE_M], 1.2], [left, STORE_Y, DECK_TOP], s);
      html += `<g transform="${k.translateAlong(P, [left, y, 0])}">${parts.copySvg(len, z, true, false)}</g>`;
    }
    return { html, ev };
  };
}

// One line for the readout while a late row is about.
export function lateText(g, ev) {
  const name = nameOf(g, ev.p);
  if (ev.kind === "sealed") return ev.f < 1 ? `Late row for ${name} · sealed by DROP LOCAL` : `Late row for ${name} · sealed, so the write is skipped at apply time`;
  if (ev.f < 1) return `Late row for ${name} · uploaded to cold storage, not sealed yet`;
  return `Late row for ${name} · lands in the local copy · QuestDB replaces its Parquet partition in cold storage`;
}
