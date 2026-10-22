// Live behaviour of Fig 10. Time runs at one day per UNIT_SECONDS, as in Fig 2; a backup
// runs every midnight. Hover a partition to see which backup holds it, or a backup's tray
// to light everything its manifest names; KEEP LATEST sets backup.cleanup.keep.latest.n;
// BACKUP NOW runs BACKUP DATABASE at once; Space pauses.
// `stage` is the .iso-stage element, `data` = { P }, `k` the iso kit, `G` the lathe kit.
import { PRESETS, UNIT_SECONDS, clockOf } from "./fig1/model.mjs";
import { makeParts } from "./fig1/parts.mjs";
import { makeScene } from "./fig1/scene.mjs";
import { GRAIN, KEEP_DEFAULT } from "./backup.mjs";
import { C6, makeBackups, storyOf } from "./draw.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";

export function mount(stage, data, k, G) {
  const { P } = data;
  const parts = makeParts(k, G, P);
  const scene = makeScene(k, P, parts);
  const backups = makeBackups(k, P, parts);
  const svg = stage.querySelector("svg");
  const figure = stage.closest(".iso-figure");
  const one = (name) => svg.querySelector(`[data-part="${name}"]`);
  const layers = {
    store: one("store"), copy: one("copy"), feed: one("feed"), hand: one("hand"),
    lamps: [one("lamp-0"), one("lamp-1")], blocks: [one("blocks-0"), one("blocks-1")],
    wal: one("wal6"), rows: one("rows6"), tiles: one("tiles6"), flying: one("flying6"), labels: one("labels6"),
  };
  const readout = figure?.querySelector("[data-readout]");
  const controls = figure?.querySelector(".sa-grain");
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  let u = data.u0 ?? PRESETS[GRAIN].start;
  let keep = KEEP_DEFAULT, manual = [];
  let paused = false, hovered = null, frame = 0, last = 0, visible = false;
  const written = new Map();
  const put = (el, html) => { if (el && written.get(el) !== html) { el.innerHTML = html; written.set(el, html); } };

  // keyed items: one <g> each, moved by transform, rebuilt on a new key
  function sync(layer, items) {
    if (!layer) return;
    const seen = new Set();
    let prev = null;
    for (const it of items) {
      seen.add(it.id);
      let el = layer.querySelector(`:scope > [data-id="${it.id}"]`);
      if (!el) {
        el = document.createElementNS(SVG_NS, "g");
        el.dataset.id = it.id;
        if (it.p !== undefined) el.dataset.p = String(it.p);
        if (it.row !== undefined) el.dataset.row = String(it.row);
      }
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

  function draw() {
    const f = scene(GRAIN, u, hovered?.p ?? null, C6);
    C6.lanes.forEach((i) => sync(layers.blocks[i], f.lanes[i]));
    sync(layers.store, f.store);
    put(layers.copy, f.copy);
    put(layers.feed, f.feed);
    C6.lanes.forEach((i) => put(layers.lamps[i], f.lamps[i]));
    layers.hand?.setAttribute("d", f.hand);
    const b = backups(u, keep, manual, hovered);
    sync(layers.rows, b.rows);
    sync(layers.tiles, b.tiles);
    put(layers.wal, b.wal);
    put(layers.flying, b.flying);
    put(layers.labels, b.labels);
    const text = storyOf(u, keep, manual, hovered, (t) => clockOf(GRAIN, t)) + (paused ? " · paused" : "");
    if (readout && readout.textContent !== text) readout.textContent = text;
  }
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    if (!paused) u += dt / UNIT_SECONDS;
    manual = manual.filter((m) => m > u - 40);
    draw();
    frame = visible && !paused && !still.matches ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };

  function setKeep(n) {
    keep = n;
    for (const b of controls?.querySelectorAll("[data-keep]") ?? []) b.setAttribute("aria-checked", String(Number(b.dataset.keep) === keep));
    draw();
  }
  function onClick(e) {
    const b = e.target.closest?.("button");
    if (!b) return;
    if (b.dataset.keep) setKeep(Number(b.dataset.keep));
    if (b.dataset.backup !== undefined) {
      // one backup at a time, as the backup lock allows
      const busy = Math.floor(u) > u - 0.45 || manual.some((m) => u - m < 0.45);
      if (!busy) manual.push(u);
      draw();
    }
    run();
  }
  const picked = (target) => {
    const el = target instanceof Element ? target.closest("[data-p],[data-row]") : null;
    if (!el) return null;
    if (el.dataset.p !== undefined) return { p: Number(el.dataset.p) };
    return { row: Number(el.dataset.row) };
  };
  const same = (a, b) => (a?.p ?? null) === (b?.p ?? null) && (a?.row ?? null) === (b?.row ?? null);
  const hover = (h) => { if (same(h, hovered)) return; hovered = h; if (!frame) draw(); };
  const onMove = (e) => { if (e.pointerType !== "touch") hover(picked(e.target)); };
  const onTap = (e) => { if (e.pointerType === "touch") hover(picked(e.target)); };
  const onLeave = () => hover(null);
  const onKey = (e) => { if (e.key === " ") { e.preventDefault(); paused = !paused; if (!paused) run(); else draw(); } };
  const observer = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  observer.observe(stage);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerleave", onLeave);
  stage.addEventListener("pointerdown", onTap);
  stage.addEventListener("keydown", onKey);
  controls?.addEventListener("click", onClick);
  // for checks and stills: a moment, paused, with an optional hover
  stage.seek = (v, opts = {}) => { u = v; if (opts.keep) setKeep(opts.keep); hovered = opts.hover ?? null; paused = true; draw(); };
  // from the start, running: the series page's RESTART button
  stage.restart = () => { u = data.u0 ?? PRESETS[GRAIN].start; paused = false; draw(); run(); };
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
