// Live behaviour of Fig 4. The cluster from Fig 2 keeps running: partitions age along the
// benches, the manager uploads, instances convert and drop, WAL streams through the store.
// The reader picks a time range and the columns to select, and the figure keeps lighting
// what that query reads right now, on the instance running it and in the object store.
// Hover a partition for what is read from it; Space pauses. When nobody is driving, it
// steps through a tour of ranges and columns on its own.
// `stage` is the .iso-stage element, `data` = { P, u0 }, `k` the iso kit, `G` the lathe kit.
import { UNIT_SECONDS, clockOf, partitionsAt } from "../fig1-partitions/model.mjs";
import { makeParts } from "../fig1-partitions/parts.mjs";
import { makeScene } from "../fig1-partitions/scene.mjs";
import { DEFAULT_COLS, DEFAULT_RANGE, GRAIN, TOUR, planOf, planText, rangeOf, readText, sqlHtml } from "./query.mjs";
import { makeFigure } from "./figure.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
// The idle tour steps every STEP seconds, and waits IDLE seconds after the reader last
// touched the figure before it starts again.
const STEP = 5;
const IDLE = 12;

export function mount(stage, data, k, G) {
  const { P } = data;
  const parts = makeParts(k, G, P);
  const render = makeFigure(k, P, parts, makeScene(k, P, parts));
  const svg = stage.querySelector("svg");
  const figure = stage.closest(".iso-figure");
  const one = (name) => svg.querySelector(`[data-part="${name}"]`);
  const L3 = [0, 1, 2];
  const layers = {
    store: one("store"), copy: one("copy"), wal: one("wal"), rods: one("rods"), flying: one("flying"), feed: one("feed"), hand: one("hand"), caliper: one("caliper"),
    blocks: L3.map((i) => one("blocks-" + i)), lamps: L3.map((i) => one("lamp-" + i)),
  };
  const readout = figure?.querySelector("[data-readout]");
  const sql = figure?.querySelector("[data-sql]");
  const controls = figure?.querySelector(".sa-grain");
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  let u = data.u0;
  let rangeKey = DEFAULT_RANGE;
  let cols = [...DEFAULT_COLS];
  let hovered = null, paused = false;
  let frame = 0, last = 0, t = 0, visible = false;
  let idle = IDLE, sinceStep = 0, tourAt = 0;
  const written = new Map();
  const put = (el, html) => { if (el && written.get(el) !== html) { el.innerHTML = html; written.set(el, html); } };

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
      if (el.dataset.key !== it.key) { el.innerHTML = it.html(); el.dataset.key = it.key; }
      prev = el;
    }
    for (const el of [...layer.children]) if (!seen.has(el.dataset.id)) el.remove();
  }

  function draw() {
    const f = render(rangeKey, cols, u, hovered, t);
    f.lanes.forEach((items, i) => sync(layers.blocks[i], items));
    sync(layers.store, f.store);
    put(layers.copy, f.copy);
    put(layers.wal, f.wal);
    put(layers.rods, f.rods);
    put(layers.flying, f.flying);
    put(layers.feed, f.feed);
    put(layers.caliper, f.caliper);
    f.lamps.forEach((lamp, i) => put(layers.lamps[i], lamp));
    layers.hand?.setAttribute("d", f.hand);
    const range = rangeOf(rangeKey);
    const text = hovered !== null ? readText(hovered, range, cols, u) : clockOf(GRAIN, u) + (paused ? " · paused" : "") + " · " + planText(planOf(range, cols, partitionsAt(GRAIN, u), u));
    if (readout && readout.textContent !== text) readout.textContent = text;
    const q = sqlHtml(range, cols);
    if (sql && written.get(sql) !== q) { sql.innerHTML = q; written.set(sql, q); }
  }
  // set the query and show it on the controls
  function choose(r, c) {
    rangeKey = r;
    cols = [...c];
    for (const x of controls?.querySelectorAll("[data-range]") ?? []) x.setAttribute("aria-checked", String(x.dataset.range === rangeKey));
    for (const x of controls?.querySelectorAll("[data-col]") ?? []) x.setAttribute("aria-pressed", String(cols.includes(x.dataset.col)));
  }
  // any input from the reader holds the tour back for IDLE seconds
  const touch = () => { idle = 0; sinceStep = 0; };
  function tour(dt) {
    idle += dt;
    sinceStep += dt;
    if (idle < IDLE || sinceStep < STEP) return;
    sinceStep = 0;
    tourAt = (tourAt + 1) % TOUR.length;
    choose(...TOUR[tourAt]);
  }
  function tick(now) {
    const dt = (last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60) * (Number(stage.dataset.speed) || 1);
    last = now;
    if (!paused) { u += dt / UNIT_SECONDS; t += dt; tour(dt); }
    draw();
    frame = visible && !paused && !still.matches ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };

  function onClick(e) {
    const b = e.target.closest?.("button");
    if (!b) return;
    touch();
    if (b.dataset.range) choose(b.dataset.range, cols);
    else if (b.dataset.col) {
      const c = b.dataset.col;
      const on = cols.includes(c);
      if (on && cols.length === 1) return; // a query selects at least one column
      choose(rangeKey, on ? cols.filter((x) => x !== c) : [...cols, c]);
    }
    draw();
  }
  const picked = (target) => {
    const hit = target instanceof Element ? target.closest("[data-p]") : null;
    return hit ? Number(hit.dataset.p) : null;
  };
  const hover = (p) => { if (p === hovered) return; hovered = p; if (!frame) draw(); };
  const onMove = (e) => { touch(); if (e.pointerType !== "touch") hover(picked(e.target)); };
  const onTap = (e) => { touch(); if (e.pointerType === "touch") hover(picked(e.target)); };
  const onLeave = () => hover(null);
  const onKey = (e) => { touch(); if (e.key === " ") { e.preventDefault(); paused = !paused; if (!paused) run(); else draw(); } };
  const observer = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  observer.observe(stage);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerleave", onLeave);
  stage.addEventListener("pointerdown", onTap);
  stage.addEventListener("keydown", onKey);
  controls?.addEventListener("click", onClick);
  // for checks and stills: a range, columns and a moment, paused
  stage.pick = (r, c, at) => {
    choose(r, c ?? cols);
    if (at !== undefined) { u = at; paused = true; }
    draw();
  };
  // from the start, running: the series page's RESTART button
  stage.restart = () => { u = data.u0; t = 0; paused = false; draw(); run(); };
  draw();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    stage.removeEventListener("pointermove", onMove);
    stage.removeEventListener("pointerleave", onLeave);
    stage.removeEventListener("pointerdown", onTap);
    stage.removeEventListener("keydown", onKey);
    controls?.removeEventListener("click", onClick);
  };
}
