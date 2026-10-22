// Live behaviour of Fig 3, in two scenarios. APPEND + TIERING: three writers in parallel,
// the sequencer's order, apply into today's partition, then the storage policy's pass at
// midnight over one partition of each age. LATE ROWS: after the pass, a late commit from each
// writer into a native, a Parquet and a sealed partition. Each loops; when nobody is driving,
// the tour alternates them. Hover a file for what is in it; Space pauses. `stage` is the
// .iso-stage element, `data` = { P }, `k` the iso kit.
import { SCENARIOS, lateText, stepText } from "./files.mjs";
import { describe, makeInternals } from "./draw.mjs";

const FADE = 0.6;
const IDLE = 12; // seconds without a click or a key before the tour takes over again

export function mount(stage, data, k) {
  const { P } = data;
  const parts = makeInternals(k, P);
  const svg = stage.querySelector("svg");
  const figure = stage.closest(".iso-figure");
  const one = (name) => svg.querySelector(`[data-part="${name}"]`);
  const layers = { fills: one("fills"), flying: one("flying"), links: one("links"), tags: one("tags"), moving: one("moving") };
  const groups = Object.fromEntries(parts.groups.map((g) => [g, one(g)]));
  const readout = figure?.querySelector("[data-readout]");
  const controls = figure?.querySelector(".sa-grain");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const label = (pt, s, opts = {}) => {
    const [x, y] = k.iso(pt, P);
    const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return `<text class="sa-label"${opts.sub ? ' data-sub=""' : ""} x="${(x + (opts.dx ?? 0)).toFixed(1)}" y="${(y + (opts.dy ?? 0)).toFixed(1)}" text-anchor="${opts.anchor ?? "start"}">${esc}</text>`;
  };

  let s = 0, paused = false, frame = 0, last = 0, visible = false, hovered = null;
  let scenario = "policy", idle = IDLE;
  const other = () => (scenario === "policy" ? "late" : "policy");
  const next = () => (idle >= IDLE ? other() : scenario);
  const written = new Map();
  const put = (el, html) => { if (el && written.get(el) !== html) { el.innerHTML = html; written.set(el, html); } };
  const fade = (el, v) => el?.setAttribute("opacity", Math.max(0, v).toFixed(2));

  function render() {
    const r = parts.render(s, label, scenario, next());
    const loop = SCENARIOS[scenario].loop;
    put(layers.fills, r.fills);
    put(layers.flying, r.flying);
    put(layers.links, r.links);
    put(layers.tags, r.tags);
    for (const g of parts.groups) fade(groups[g], r.opacity[g]);
    fade(layers.moving, Math.min(1, s / FADE, (loop - s) / FADE));
    const text = (hovered && describe(hovered)) || (scenario === "late" ? lateText(s) : stepText(s)) + (paused ? " · paused" : "");
    if (readout && readout.textContent !== text) readout.textContent = text;
  }
  function tick(now) {
    const dt = (last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60) * (Number(stage.dataset.speed) || 1);
    last = now;
    if (!paused) {
      s += dt;
      idle += dt;
      if (s >= SCENARIOS[scenario].loop) { s = 0; choose(next()); }
    }
    render();
    frame = visible && !paused && !still.matches ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };
  function choose(sc) {
    scenario = sc;
    for (const b of controls?.querySelectorAll("[data-scenario]") ?? []) b.setAttribute("aria-checked", String(b.dataset.scenario === sc));
  }
  function onClick(e) {
    const b = e.target.closest?.("[data-scenario]");
    if (!b) return;
    idle = 0;
    choose(b.dataset.scenario);
    s = 0;
    paused = false;
    render();
    run();
  }
  const picked = (target) => (target instanceof Element ? target.closest("[data-file]")?.dataset.file ?? null : null);
  const hover = (f) => { if (f === hovered) return; hovered = f; render(); };
  const onMove = (e) => { if (e.pointerType !== "touch") hover(picked(e.target)); };
  const onTap = (e) => { if (e.pointerType === "touch") hover(picked(e.target)); };
  const onLeave = () => hover(null);
  const onKey = (e) => { idle = 0; if (e.key === " ") { e.preventDefault(); paused = !paused; if (!paused) run(); else render(); } };
  const observer = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  observer.observe(stage);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerleave", onLeave);
  stage.addEventListener("pointerdown", onTap);
  stage.addEventListener("keydown", onKey);
  controls?.addEventListener("click", onClick);
  // for checks and stills: a scenario and a moment, paused
  stage.seek = (v, sc = scenario) => { choose(sc); s = v; paused = true; render(); };
  // from the start, running: the series page's RESTART button
  stage.restart = () => { s = 0; paused = false; render(); run(); };
  render();
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
