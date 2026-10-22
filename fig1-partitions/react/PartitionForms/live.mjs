// Live behaviour of Fig 1. Time runs at one partition width per UNIT_SECONDS; every
// moving part is redrawn from the pure model for the current time. Hover a partition to
// light it on every instance and on the deck; Space pauses; the right arrow skips to just
// before the next stage falls due; the PARTITION BY switch changes the grain and policy.
// `stage` is the .iso-stage element, `data` = { P, grain }, `k` the iso kit, `G` the lathe kit.
import { CLUSTER, INSTANCES, MANAGER_MODES, POLICY, PRESETS, SINGLE, UNIT_SECONDS, clockOf, clusterFor, eventsOf, managerAt, nextDue, nextWorkText, partitionText, partitionsAt, policySql, stagesOf, ttlOf } from "./model.mjs";
import { DECK, HEAD, LANE_Y, makeParts } from "./parts.mjs";
import { makeScene, ticksOf } from "./scene.mjs";
import { LATE, lateText, makeLate } from "./late.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";

export function mount(stage, data, k, G) {
  const { P } = data;
  if (data.dropRemote) POLICY.dropRemote = true; // Fig 1 draws the fourth stage
  let C = data.cluster === "single" ? SINGLE : CLUSTER;
  let managerMode = "steady"; // Fig 5: who holds the cold storage manager role, over time
  const parts = makeParts(k, G, P);
  const render = makeScene(k, P, parts);
  const late = data.lateWrites ? makeLate(k, P, parts) : null; // Fig 1 shows late writes
  const svg = stage.querySelector("svg");
  const figure = stage.closest(".iso-figure");
  const one = (name) => svg.querySelector(`[data-part="${name}"]`);
  const L3 = [0, 1, 2];
  const layers = {
    store: one("store"), copy: one("copy"), wal: one("wal"), rods: one("rods"), flying: one("flying"), feed: one("feed"), hand: one("hand"), dial: one("dial"),
    ruler: one("ruler"), labels: one("labels"), late: one("late"), mgr: one("mgr"),
    lanes: L3.map((i) => one("lane-" + i)),
    blocks: L3.map((i) => one("blocks-" + i)), lamps: L3.map((i) => one("lamp-" + i)),
    marks: L3.map((i) => one("marks-" + i)), marksf: L3.map((i) => one("marksf-" + i)),
  };
  const readout = figure?.querySelector("[data-readout]");
  const caption = figure?.querySelector(".iso-caption");
  const sql = figure?.querySelector("[data-sql]");
  const group = figure?.querySelector(".sa-grain");
  const buttons = [...(group?.querySelectorAll("[data-grain]") ?? [])];
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  let grain = data.grain;
  let u = PRESETS[grain].start;
  let paused = false, hovered = null, ticks = 0;
  let frame = 0, last = 0, visible = false;
  const written = new Map();
  const put = (el, html) => { if (el && written.get(el) !== html) { el.innerHTML = html; written.set(el, html); } };

  // keyed items: one <g> per pallet or copy, moved by transform, rebuilt on a new key
  function sync(layer, items) {
    if (!layer) return; // a bench this figure does not show
    const seen = new Set();
    let prev = null;
    for (const it of items) {
      seen.add(it.id);
      let el = layer.querySelector(`:scope > [data-id="${it.id}"]`);
      if (!el) { el = document.createElementNS(SVG_NS, "g"); el.dataset.id = it.id; el.dataset.p = String(it.p); }
      const next = prev ? prev.nextSibling : layer.firstChild;
      if (next !== el) layer.insertBefore(el, next);
      el.setAttribute("transform", k.translateAlong(P, [it.x, it.y, 0]));
      const op = it.opacity ?? 1;
      if (op < 0.999) el.setAttribute("opacity", op.toFixed(2)); else el.removeAttribute("opacity");
      if (el.dataset.key !== it.key) { el.innerHTML = it.html(); el.dataset.key = it.key; }
      prev = el;
    }
    for (const el of [...layer.children]) if (!seen.has(el.dataset.id)) el.remove();
  }

  let lateEv = null;
  function draw() {
    // a late row lights the partition it lands on, and hides its copy in cold storage while
    // the replacement goes up
    const lr = late ? late(grain, u) : { html: "", ev: null };
    lateEv = lr.ev;
    const landed = lateEv && lateEv.f >= 1 && lateEv.after < LATE.flash * 2 ? lateEv.p : null;
    const f = render(grain, u, hovered ?? landed, C);
    if (lateEv?.replacing && lateEv.after >= LATE.flash) f.store = f.store.map((it) => (it.p === lateEv.p ? { ...it, opacity: 0.2 } : it));
    put(layers.late, lr.html);
    f.lanes.forEach((items, i) => sync(layers.blocks[i], items));
    sync(layers.store, f.store);
    put(layers.copy, f.copy);
    put(layers.wal, f.wal);
    put(layers.rods, f.rods);
    put(layers.flying, f.flying);
    put(layers.feed, f.feed);
    f.lamps.forEach((lamp, i) => put(layers.lamps[i], lamp));
    if (layers.mgr) drawManager();
    layers.hand?.setAttribute("d", f.hand);
    const t = ticksOf(grain, u);
    if (t !== ticks) { put(layers.dial, parts.dialSvg(t)); ticks = t; }
    say();
  }
  // Fig 5's manager scenarios: who holds _manager.lock, the commands as they are issued, and
  // the bench of an instance that is down fading back
  const NAMES5 = ["primary", "replica 1", "replica 2"];
  function managerState() {
    const seg = managerAt(C, u);
    const m = MANAGER_MODES[managerMode];
    const period = m.schedule?.period ?? 1;
    const r = ((u % period) + period) % period;
    const cmd = m.commands.find(([t]) => r >= t && r < t + 0.7);
    const waiting = partitionsAt(grain, u).filter((p) => { const e = eventsOf(grain, p, C); return u > p + 1 + ttlOf(grain, 0, p) + 0.01 && u < e.up; }).length;
    return { seg, cmd, waiting };
  }
  function drawManager() {
    const { seg, cmd } = managerState();
    L3.forEach((i) => layers.lanes[i]?.setAttribute("opacity", seg.down === i ? "0.35" : "1"));
    let out = "";
    // the lock, above the deck's sign, and the command just issued beneath it
    const lockAt = [DECK.x + DECK.w, DECK.y, DECK.z + DECK.t];
    const holder = seg.manager >= 0 ? NAMES5[seg.manager] : null;
    out += parts.label(lockAt, holder ? "_manager.lock · " + holder : "_manager.lock · nobody", { anchor: "end", dy: -26 });
    out += parts.label(lockAt, cmd ? `${NAMES5[cmd[1]]} › ${cmd[2]}` : holder ? "uploads, seals and GC run there" : "uploads and GC paused, reads continue", { anchor: "end", dy: -15, sub: !cmd });
    // the role, after the name of whoever holds it, and a downed instance says so
    const after = (i) => [HEAD.x + HEAD.w, LANE_Y[i] + HEAD.d / 2, 4];
    const dy = (i) => (i === 0 ? 12 : -2);
    if (seg.manager >= 0) out += parts.label(after(seg.manager), "· MANAGER", { anchor: "start", dx: seg.manager === 0 ? 64 : 82, dy: dy(seg.manager) });
    if (seg.down >= 0) out += parts.label(after(seg.down), "· DOWN", { anchor: "start", dx: seg.manager === seg.down ? 150 : 82, dy: dy(seg.down) });
    put(layers.mgr, out);
  }
  function managerText() {
    const { seg, waiting } = managerState();
    if (seg.down >= 0 && seg.manager < 0) return `${NAMES5[seg.down]} is down and held the manager role · nothing takes over · ${waiting} partition${waiting === 1 ? "" : "s"} waiting to upload, DROP LOCAL waits too`;
    if (seg.manager < 0) return `no manager between the switches · uploads and GC paused for a moment · reads continue`;
    return `${NAMES5[seg.manager]} holds _manager.lock` + (waiting ? ` · catching up, ${waiting} partition${waiting === 1 ? "" : "s"} to upload` : "") + (seg.down >= 0 ? ` · ${NAMES5[seg.down]} still down` : "");
  }
  function setManager(mode) {
    managerMode = mode;
    C = clusterFor(mode);
    for (const b of controls5) b.setAttribute("aria-checked", String(b.dataset.manager === mode));
    draw();
    run();
  }
  const controls5 = [...(figure?.querySelectorAll("[data-manager]") ?? [])];

  const alive = (p) => p !== null && partitionsAt(grain, u).includes(p);
  function say() {
    const text = alive(hovered) ? partitionText(grain, hovered, u, C)
      : lateEv ? clockOf(grain, u) + " · " + (paused ? "paused · " : "") + lateText(grain, lateEv)
      : managerMode !== "steady" ? clockOf(grain, u) + " · " + (paused ? "paused · " : "") + managerText()
      : clockOf(grain, u) + " · " + (paused ? "paused · " : "") + nextWorkText(grain, u);
    if (readout && readout.textContent !== text) readout.textContent = text;
  }
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    if (!paused && !still.matches) u += dt / UNIT_SECONDS;
    draw();
    frame = visible && !paused && !still.matches ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };

  function setGrain(next) {
    if (!PRESETS[next] || next === grain) return;
    grain = next;
    u = PRESETS[grain].start;
    hovered = null;
    ticks = 0;
    for (const b of buttons) b.setAttribute("aria-checked", String(b.dataset.grain === grain));
    L3.forEach((i) => { put(layers.marks[i], parts.marksBack(i, grain)); put(layers.marksf[i], parts.marksFront(i, grain)); });
    put(layers.ruler, parts.rulerSvg(grain));
    put(layers.labels, parts.labelsSvg(grain, { uploader: data.uploader }));
    if (sql) sql.textContent = policySql(grain);
    if (caption) caption.textContent = caption.textContent.replace(/PARTITION BY \w+ · STORAGE POLICY\([^)]*\)/, policySql(grain));
    draw();
    run();
  }
  // just before the next stage falls due for any partition
  function skip() {
    let best = Infinity;
    stagesOf(grain).forEach((_, n) => {
      const t = nextDue(grain, n, u + 0.02);
      if (t < best) best = t;
    });
    if (best < Infinity) u = best - 0.01;
    draw();
  }

  const picked = (target) => {
    const hit = target instanceof Element ? target.closest("[data-p]") : null;
    return hit ? Number(hit.dataset.p) : null;
  };
  const describe = () => stage.setAttribute("aria-valuetext", alive(hovered) ? partitionText(grain, hovered, u, C) : clockOf(grain, u));
  const hover = (p) => { if (p === hovered) return; hovered = p; describe(); if (!frame) draw(); };
  const onMove = (e) => { if (e.pointerType !== "touch") hover(picked(e.target)); };
  const onTap = (e) => { if (e.pointerType === "touch") hover(picked(e.target)); };
  const onLeave = () => hover(null);
  const onKey = (e) => {
    if (e.key === " ") { e.preventDefault(); paused = !paused; if (!paused) run(); else draw(); describe(); }
    if (e.key === "ArrowRight") { e.preventDefault(); skip(); describe(); }
  };
  const onClick = (e) => {
    const b = e.target.closest?.("[data-grain]");
    if (b) setGrain(b.dataset.grain);
    const m = e.target.closest?.("[data-manager]");
    if (m) setManager(m.dataset.manager);
  };
  const observer = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  observer.observe(stage);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerleave", onLeave);
  stage.addEventListener("pointerdown", onTap);
  stage.addEventListener("keydown", onKey);
  group?.addEventListener("click", onClick);
  // for checks and stills: jump to a moment, paused
  stage.seek = (g, v, mode) => { if (g !== grain) setGrain(g); if (mode) setManager(mode); u = v; paused = true; draw(); };
  describe();
  draw();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    stage.removeEventListener("pointermove", onMove);
    stage.removeEventListener("pointerleave", onLeave);
    stage.removeEventListener("pointerdown", onTap);
    stage.removeEventListener("keydown", onKey);
    group?.removeEventListener("click", onClick);
  };
}
