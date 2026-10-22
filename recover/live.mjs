// Live behaviour of Figs 7 and 8: one rebuild, played in seconds and looped, while the
// source cluster keeps running. data.figure is "replica" (Fig 8: which backup to start
// from) or "pitr" (Fig 9: new cluster or standalone, and the target on a slider). Changing
// anything starts the run again; when nobody is driving, the tour walks the modes. Space
// pauses. `stage` is the .iso-stage element, `data` = { P, figure }, `k` the iso kit, `G` the
// lathe kit.
import { nameOf } from "../fig1-partitions/model.mjs";
import { makeParts } from "../fig1-partitions/parts.mjs";
import { GRAIN } from "../fig7-backups/backup.mjs";
import { makeBackups } from "../fig7-backups/draw.mjs";
import { FIGURES, stepsOf, targetRange } from "./restore.mjs";
import { makeRestore, storyOf7 } from "./draw.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const IDLE = 10;
const HOLD = 1.5; // seconds held at the end of a run before it starts again
const TOURS = { replica: [["newest", 0], ["oldest", 0]], pitr: [["standalone", 0.55], ["cluster", 0.3], ["standalone", 0.85], ["cluster", 0.6]] };

export function mount(stage, data, k, G) {
  const { P } = data;
  const fig = data.figure;
  const parts = makeParts(k, G, P);
  const backups = makeBackups(k, P, parts);
  const draw = makeRestore(k, P, parts, backups);
  const svg = stage.querySelector("svg");
  const figure = stage.closest(".iso-figure");
  const one = (name) => svg.querySelector(`[data-part="${name}"]`);
  const layers = {
    wal: one("wal6"), rows: one("rows6"), tiles: one("tiles6"), blocks: one("blocks-new"), flying: one("flying7"), marks: one("marks7"),
    newWal: one("newwal7"), labels: one("labels7"), labels6: one("labels6"), newStore: one("newstore7"),
  };
  const readout = figure?.querySelector("[data-readout]");
  const controls = figure?.querySelector(".sa-grain");
  const slider = controls?.querySelector("[data-target]");
  const shown = controls?.querySelector("[data-target-text]");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const range = targetRange();
  const clock = (t) => { const h = Math.floor((((t % 1) + 1) % 1) * 24); return `${nameOf(GRAIN, t + 1e-6)} ${String(h).padStart(2, "0")}:00`; };
  const tourList = TOURS[fig];

  let mode = FIGURES[fig][0], target = range.min + (range.max - range.min) * 0.55, tour = 0;
  let s = 0, paused = false, frame = 0, last = 0, visible = false, idle = IDLE;
  const written = new Map();
  const put = (el, html) => { if (el && written.get(el) !== html) { el.innerHTML = html; written.set(el, html); } };
  function sync(layer, items) {
    if (!layer) return;
    const seen = new Set();
    let prev = null;
    for (const it of items) {
      seen.add(it.id);
      let el = layer.querySelector(`:scope > [data-id="${it.id}"]`);
      if (!el) { el = document.createElementNS(SVG_NS, "g"); el.dataset.id = it.id; }
      const next = prev ? prev.nextSibling : layer.firstChild;
      if (next !== el) layer.insertBefore(el, next);
      el.setAttribute("transform", k.translateAlong(P, [it.x, it.y, it.z ?? 0]));
      const op = it.opacity ?? 1;
      if (op < 0.999) el.setAttribute("opacity", op.toFixed(2)); else el.removeAttribute("opacity");
      if (el.dataset.key !== it.key) { el.innerHTML = it.html(); el.dataset.key = it.key; }
      prev = el;
    }
    for (const el of [...layer.children]) if (!seen.has(el.dataset.id)) el.remove();
  }

  function render() {
    const f = draw(mode, target, s);
    sync(layers.rows, f.src.rows);
    sync(layers.tiles, f.src.tiles);
    put(layers.wal, f.src.wal);
    sync(layers.blocks, f.blocks);
    put(layers.flying, f.flying);
    put(layers.marks, f.marks);
    put(layers.newWal, f.newWal);
    put(layers.labels, f.labels);
    put(layers.labels6, f.src.labels);
    layers.newStore?.setAttribute("opacity", f.newStore.toFixed(2));
    const text = storyOf7(mode, target, s, clock) + (paused ? " · paused" : "");
    if (readout && readout.textContent !== text) readout.textContent = text;
    if (shown) shown.textContent = clock(target);
  }
  function choose(m, t) {
    mode = m;
    if (t !== undefined) target = t;
    s = 0;
    for (const b of controls?.querySelectorAll("[data-mode]") ?? []) b.setAttribute("aria-checked", String(b.dataset.mode === mode));
    if (slider) slider.value = String(target);
  }
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    if (!paused) {
      s += dt;
      idle += dt;
      if (s >= stepsOf(mode).end + HOLD) {
        if (idle >= IDLE) { tour = (tour + 1) % tourList.length; choose(tourList[tour][0], range.min + (range.max - range.min) * tourList[tour][1]); }
        else s = 0;
      }
    }
    render();
    frame = visible && !paused && !still.matches ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };

  function onClick(e) {
    const b = e.target.closest?.("button");
    if (!b) return;
    idle = 0;
    if (b.dataset.mode) choose(b.dataset.mode);
    if (b.dataset.again !== undefined) s = 0;
    paused = false;
    render();
    run();
  }
  const onInput = () => { idle = 0; choose(mode, Number(slider.value)); paused = false; render(); run(); };
  const onKey = (e) => { idle = 0; if (e.key === " ") { e.preventDefault(); paused = !paused; if (!paused) run(); else render(); } };
  const onMove = () => { idle = 0; };
  const observer = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  observer.observe(stage);
  stage.addEventListener("keydown", onKey);
  stage.addEventListener("pointermove", onMove);
  controls?.addEventListener("click", onClick);
  slider?.addEventListener("input", onInput);
  if (slider) { slider.min = String(range.min); slider.max = String(range.max); slider.step = String(1 / 24); }
  // for checks and stills: a mode, a target (0..1 of the range) and a moment, paused
  stage.pick = (m, f, at) => { choose(m, range.min + (range.max - range.min) * f); s = at; paused = true; render(); };
  choose(mode, target);
  render();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    stage.removeEventListener("keydown", onKey);
    stage.removeEventListener("pointermove", onMove);
    controls?.removeEventListener("click", onClick);
    slider?.removeEventListener("input", onInput);
  };
}
