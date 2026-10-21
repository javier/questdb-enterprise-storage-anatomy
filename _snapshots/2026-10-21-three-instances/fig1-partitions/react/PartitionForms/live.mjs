// Live behaviour of Fig 1. Time runs at one partition width per UNIT_SECONDS; every
// moving part is redrawn from the pure model for the current time. Hover a partition to
// light it on every instance and on the deck; Space pauses; the right arrow skips to just
// before the next stage falls due; the PARTITION BY switch changes the grain and policy.
// `stage` is the .iso-stage element, `data` = { P, grain }, `k` the iso kit, `G` the lathe kit.
import { PRESETS, UNIT_SECONDS, clockOf, nextWorkText, partitionText, partitionsAt, policySql, ttlOf } from "./model.mjs";
import { makeParts } from "./parts.mjs";
import { makeScene, ticksOf } from "./scene.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";

export function mount(stage, data, k, G) {
  const { P } = data;
  const parts = makeParts(k, G, P);
  const render = makeScene(k, P, parts);
  const svg = stage.querySelector("svg");
  const figure = stage.closest(".iso-figure");
  const one = (name) => svg.querySelector(`[data-part="${name}"]`);
  const L3 = [0, 1, 2];
  const layers = {
    store: one("store"), copy: one("copy"), wal: one("wal"), rods: one("rods"), flying: one("flying"), feed: one("feed"), hand: one("hand"), dial: one("dial"),
    ruler: one("ruler"), labels: one("labels"),
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
    const seen = new Set();
    let prev = null;
    for (const it of items) {
      seen.add(it.id);
      let el = layer.querySelector(`:scope > [data-id="${it.id}"]`);
      if (!el) { el = document.createElementNS(SVG_NS, "g"); el.dataset.id = it.id; el.dataset.p = String(it.p); }
      const next = prev ? prev.nextSibling : layer.firstChild;
      if (next !== el) layer.insertBefore(el, next);
      el.setAttribute("transform", k.translateAlong(P, [it.x, it.y, 0]));
      if (el.dataset.key !== it.key) { el.innerHTML = it.html(); el.dataset.key = it.key; }
      prev = el;
    }
    for (const el of [...layer.children]) if (!seen.has(el.dataset.id)) el.remove();
  }

  function draw() {
    const f = render(grain, u, hovered);
    f.lanes.forEach((items, i) => sync(layers.blocks[i], items));
    sync(layers.store, f.store);
    put(layers.copy, f.copy);
    put(layers.wal, f.wal);
    put(layers.rods, f.rods);
    put(layers.flying, f.flying);
    put(layers.feed, f.feed);
    f.lamps.forEach((lamp, i) => put(layers.lamps[i], lamp));
    layers.hand?.setAttribute("d", f.hand);
    const t = ticksOf(grain, u);
    if (t !== ticks) { put(layers.dial, parts.dialSvg(t)); ticks = t; }
    say();
  }
  const alive = (p) => p !== null && partitionsAt(grain, u).includes(p);
  function say() {
    const text = alive(hovered) ? partitionText(grain, hovered, u) : clockOf(grain, u) + " · " + (paused ? "paused · " : "") + nextWorkText(grain, u);
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
    put(layers.labels, parts.labelsSvg(grain));
    if (sql) sql.textContent = policySql(grain);
    if (caption) caption.textContent = caption.textContent.replace(/PARTITION BY \w+ · STORAGE POLICY\([^)]*\)/, policySql(grain));
    draw();
    run();
  }
  // just before the next stage falls due for any partition
  function skip() {
    let best = Infinity;
    for (const p of partitionsAt(grain, u)) PRESETS[grain].stages.forEach((_, n) => {
      const t = p + 1 + ttlOf(grain, n, p);
      if (t > u + 0.02 && t < best) best = t;
    });
    if (best < Infinity) u = best - 0.01;
    draw();
  }

  const picked = (target) => {
    const hit = target instanceof Element ? target.closest("[data-p]") : null;
    return hit ? Number(hit.dataset.p) : null;
  };
  const describe = () => stage.setAttribute("aria-valuetext", alive(hovered) ? partitionText(grain, hovered, u) : clockOf(grain, u));
  const hover = (p) => { if (p === hovered) return; hovered = p; describe(); if (!frame) draw(); };
  const onMove = (e) => { if (e.pointerType !== "touch") hover(picked(e.target)); };
  const onTap = (e) => { if (e.pointerType === "touch") hover(picked(e.target)); };
  const onLeave = () => hover(null);
  const onKey = (e) => {
    if (e.key === " ") { e.preventDefault(); paused = !paused; if (!paused) run(); else draw(); describe(); }
    if (e.key === "ArrowRight") { e.preventDefault(); skip(); describe(); }
  };
  const onClick = (e) => { const b = e.target.closest?.("[data-grain]"); if (b) setGrain(b.dataset.grain); };
  const observer = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  observer.observe(stage);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerleave", onLeave);
  stage.addEventListener("pointerdown", onTap);
  stage.addEventListener("keydown", onKey);
  group?.addEventListener("click", onClick);
  // for checks and stills: jump to a moment, paused
  stage.seek = (g, v) => { if (g !== grain) setGrain(g); u = v; paused = true; draw(); };
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
