// Live behaviour of Fig 3. The instance from Fig 2 keeps running; the reader picks who runs
// the query, QuestDB or the external engines, and the time range and columns as in Fig 2.
// The external engines, Databricks, Trino, Athena, BigQuery and DuckDB, all read at once; the
// query line cycles through their SQL dialects, one every SQL_STEP seconds. When nobody is driving, the tour alternates the readers over the same ranges, so what
// only QuestDB can see shows on its own. Space pauses.
// `stage` is the .iso-stage element, `data` = { P, u0 }, `k` the iso kit, `G` the lathe kit.
import { UNIT_SECONDS, clockOf, nameOf, partitionsAt } from "./fig1/model.mjs";
import { makeParts } from "./fig1/parts.mjs";
import { makeScene } from "./fig1/scene.mjs";
import { GRAIN, planOf, planText, rangeOf, readText, sqlHtml } from "./fig2/query.mjs";
import { makeFigure } from "./fig2/figure.mjs";
import { ENGINES, engineHtml, externalPlan, externalReadText, externalText } from "./external.mjs";
import { makeExternal } from "./draw.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const STEP = 6;
const SQL_STEP = 3;
const IDLE = 12;
const TOUR3 = [
  ["questdb", "45d", ["ts", "symbol", "price"]],
  ["external", "45d", ["ts", "symbol", "price"]],
  ["external", "12h", ["ts", "price"]],
  ["questdb", "12h", ["ts", "price"]],
  ["external", "mid", ["ts", "symbol", "price"]],
  ["external", "7d", ["ts", "amount"]],
];

export function mount(stage, data, k, G) {
  const { P } = data;
  const parts = makeParts(k, G, P);
  const scene = makeScene(k, P, parts);
  const render = makeExternal(k, P, parts, makeFigure(k, P, parts, scene), scene);
  const svg = stage.querySelector("svg");
  const figure = stage.closest(".iso-figure");
  const one = (name) => svg.querySelector(`[data-part="${name}"]`);
  const layers = {
    store: one("store"), copy: one("copy"), rods: one("rods"), feed: one("feed"), hand: one("hand"), caliper: one("caliper"),
    blocks: one("blocks-0"), lamp: one("lamp-0"), terminals: one("terminals"), terminalLabels: one("terminal-labels"),
  };
  const readout = figure?.querySelector("[data-readout]");
  const sql = figure?.querySelector("[data-sql]");
  const controls = figure?.querySelector(".sa-grain");
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  let u = data.u0;
  let [reader, rangeKey, cols] = TOUR3[0];
  cols = [...cols];
  let hovered = null, paused = false;
  let frame = 0, last = 0, t = 0, visible = false;
  let idle = IDLE, sinceStep = 0, tourAt = 0;
  const written = new Map();
  const put = (el, html) => { if (el && written.get(el) !== html) { el.innerHTML = html; written.set(el, html); } };
  function sync(layer, items) {
    if (!layer) return;
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
    const f = render(reader, rangeKey, cols, u, hovered, t);
    sync(layers.blocks, f.lanes[0]);
    sync(layers.store, f.store);
    put(layers.copy, f.copy);
    put(layers.rods, f.rods);
    put(layers.feed, f.feed);
    put(layers.caliper, f.caliper);
    put(layers.lamp, f.lamps[0]);
    put(layers.terminals, f.terminals);
    put(layers.terminalLabels, f.terminalLabels);
    layers.hand?.setAttribute("d", f.hand);
    const range = rangeOf(rangeKey);
    const ps = partitionsAt(GRAIN, u);
    const ext = reader === "external";
    const text = hovered !== null
      ? (ext ? externalReadText(hovered, range, u, nameOf(GRAIN, hovered), "every external engine") : readText(hovered, range, cols, u))
      : clockOf(GRAIN, u) + (paused ? " · paused" : "") + " · " + (ext ? externalText(externalPlan(range, cols, ps, u), "5 engines in parallel") : "QuestDB: " + planText(planOf(range, cols, ps, u)));
    if (readout && readout.textContent !== text) readout.textContent = text;
    const q = ext ? engineHtml(ENGINES[Math.floor(t / SQL_STEP) % ENGINES.length], range, cols) : sqlHtml(range, cols);
    if (sql && written.get(sql) !== q) { sql.innerHTML = q; written.set(sql, q); }
  }
  function choose(r, rk, c) {
    reader = r;
    rangeKey = rk;
    cols = [...c];
    for (const x of controls?.querySelectorAll("[data-reader]") ?? []) x.setAttribute("aria-checked", String(x.dataset.reader === reader));
    for (const x of controls?.querySelectorAll("[data-range]") ?? []) x.setAttribute("aria-checked", String(x.dataset.range === rangeKey));
    for (const x of controls?.querySelectorAll("[data-col]") ?? []) x.setAttribute("aria-pressed", String(cols.includes(x.dataset.col)));
  }
  const touch = () => { idle = 0; sinceStep = 0; };
  function tour(dt) {
    idle += dt;
    sinceStep += dt;
    if (idle < IDLE || sinceStep < STEP) return;
    sinceStep = 0;
    tourAt = (tourAt + 1) % TOUR3.length;
    choose(...TOUR3[tourAt]);
  }
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
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
    if (b.dataset.reader) choose(b.dataset.reader, rangeKey, cols);
    else if (b.dataset.range) choose(reader, b.dataset.range, cols);
    else if (b.dataset.col) {
      const c = b.dataset.col;
      const on = cols.includes(c);
      if (on && cols.length === 1) return; // a query selects at least one column
      choose(reader, rangeKey, on ? cols.filter((x) => x !== c) : [...cols, c]);
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
  // for checks and stills: a reader, a range, columns and a moment, paused
  stage.pick = (r, rk, c, at) => { choose(r, rk, c ?? cols); if (at !== undefined) { u = at; paused = true; } draw(); };
  choose(reader, rangeKey, cols);
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
