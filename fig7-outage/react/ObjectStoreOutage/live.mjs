// Live behaviour of Fig 7: three days of object store outage and the recovery after it,
// played at Fig 1's pace (a day every UNIT_SECONDS) and looped. Space pauses.
// `stage` is the .iso-stage element, `data` = { P }, `k` the iso kit, `G` the lathe kit.
import { UNIT_SECONDS, clockOf } from "./fig1/model.mjs";
import { makeParts } from "./fig1/parts.mjs";
import { makeScene } from "./fig1/scene.mjs";
import { makeBackups } from "./fig8/draw.mjs";
import { GRAIN, U_END, U_START } from "./outage.mjs";
import { makeOutage, storyOf7 } from "./draw.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const FADE = 0.25; // days of fade at each end of the loop

export function mount(stage, data, k, G) {
  const { P } = data;
  const parts = makeParts(k, G, P);
  const draw = makeOutage(k, P, parts, makeScene(k, P, parts), makeBackups(k, P, parts));
  const svg = stage.querySelector("svg");
  const figure = stage.closest(".iso-figure");
  const one = (name) => svg.querySelector(`[data-part="${name}"]`);
  const layers = {
    store: one("store"), copy: one("copy"), feed: one("feed"), hand: one("hand"), blocks: [one("blocks-0"), one("blocks-1")], lamps: [one("lamp-0"), one("lamp-1")],
    wal: one("wal6"), rows: one("rows6"), tiles: one("tiles6"), flying: one("flying6"), labels6: one("labels6"),
    remote: one("remote"), gauge: one("gauge"), pile: one("pile"), labels: one("labels7"), all: one("moving7"),
  };
  const readout = figure?.querySelector("[data-readout]");
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  let u = data.u0 ?? U_START, t = 0;
  let paused = false, frame = 0, last = 0, visible = false;
  const written = new Map();
  const put = (el, html) => { if (el && written.get(el) !== html) { el.innerHTML = html; written.set(el, html); } };
  function sync(layer, items) {
    if (!layer) return;
    const seen = new Set();
    let prev = null;
    for (const it of items) {
      seen.add(it.id);
      let el = layer.querySelector(`:scope > [data-id="${it.id}"]`);
      if (!el) { el = document.createElementNS(SVG_NS, "g"); el.dataset.id = it.id; if (it.p !== undefined) el.dataset.p = String(it.p); }
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
    const r = draw(u, t);
    [0, 1].forEach((i) => sync(layers.blocks[i], r.f.lanes[i]));
    sync(layers.store, r.f.store);
    put(layers.copy, r.f.copy);
    put(layers.feed, r.f.feed);
    r.f.lamps.forEach((lamp, i) => put(layers.lamps[i], lamp));
    layers.hand?.setAttribute("d", r.f.hand);
    sync(layers.rows, r.b.rows);
    sync(layers.tiles, r.b.tiles);
    put(layers.wal, r.b.wal);
    put(layers.flying, r.b.flying);
    put(layers.labels6, r.b.labels);
    put(layers.gauge, r.gauge);
    put(layers.pile, r.pile);
    put(layers.labels, r.labels);
    layers.remote?.setAttribute("opacity", r.remote.toFixed(2));
    // the loop fades out at the end and back in at the start
    const fade = Math.max(0, Math.min(1, (u - U_START) / FADE, (U_END - u) / FADE));
    layers.all?.setAttribute("opacity", fade.toFixed(2));
    const text = storyOf7(u, t, clockOf(GRAIN, u)) + (paused ? " · paused" : "");
    if (readout && readout.textContent !== text) readout.textContent = text;
  }
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    if (!paused) {
      u += dt / UNIT_SECONDS;
      t += dt;
      if (u >= U_END) { u = U_START; t = 0; }
    }
    render();
    frame = visible && !paused && !still.matches ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };
  const onKey = (e) => { if (e.key === " ") { e.preventDefault(); paused = !paused; if (!paused) run(); else render(); } };
  const observer = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  observer.observe(stage);
  stage.addEventListener("keydown", onKey);
  // for checks and stills: a moment, paused
  stage.seek = (v, s = 0) => { u = v; t = s; paused = true; render(); };
  render();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    stage.removeEventListener("keydown", onKey);
  };
}
