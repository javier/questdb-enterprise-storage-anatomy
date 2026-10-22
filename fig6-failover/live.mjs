// Live behaviour of Fig 8: a planned switchover or an unplanned failure, played in real
// time and looped; every loop starts again from a healthy cluster. The reader picks the
// scenario and durable or plain ACK; when nobody is driving, a tour plays the planned
// switchover, then the failure with durable ACK, then with plain ACK. REPLAY starts the
// scenario again; Space pauses.
// `stage` is the .iso-stage element, `data` = { P }, `k` the iso kit, `G` the lathe kit.
import { makeParts } from "../fig1-partitions/parts.mjs";
import { MODE_ORDER, SCENARIO_ORDER, simulate } from "./fail.mjs";
import { laneOpacity, makeFail, storyOf } from "./draw.mjs";

const IDLE = 12;
const FADE = 0.6; // seconds of fade at the end of each loop
const TOUR = [["planned", "durable"], ["unplanned", "durable"], ["unplanned", "plain"]];

export function mount(stage, data, k, G) {
  const { P } = data;
  const parts = makeParts(k, G, P);
  const draw = makeFail(k, P, parts);
  const svg = stage.querySelector("svg");
  const figure = stage.closest(".iso-figure");
  const one = (name) => svg.querySelector(`[data-part="${name}"]`);
  const layers = {
    wire: one("wire"), flying: one("flying"), bay: one("bay5"), dead: one("dead"), ring: one("ring"), labels: one("labels5"),
    moving: [one("moving"), one("moving2")], lanes: [one("lane0"), one("lane1"), one("lane2")],
  };
  const readout = figure?.querySelector("[data-readout]");
  const controls = figure?.querySelector(".sa-grain");
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  const runs = {};
  for (const sc of SCENARIO_ORDER) for (const m of MODE_ORDER) runs[`${sc}/${m}`] = simulate(sc, m);
  let scenario = "planned", mode = "durable", tour = 0;
  let t = data.t0 ?? 1;
  let paused = false, frame = 0, last = 0, visible = false, idle = IDLE;
  const written = new Map();
  const put = (el, html) => { if (el && written.get(el) !== html) { el.innerHTML = html; written.set(el, html); } };
  const rec = () => runs[`${scenario}/${mode}`];

  function render() {
    const r = rec();
    const f = draw(r, t);
    put(layers.wire, f.wire);
    put(layers.flying, f.flying);
    put(layers.bay, f.bay);
    put(layers.dead, f.dead);
    put(layers.ring, f.ring);
    put(layers.labels, f.labels);
    // fade out at the end of the loop and back in at the start
    const fade = Math.max(0, Math.min(1, t / FADE, (r.loop - t) / FADE));
    for (const g of layers.moving) g?.setAttribute("opacity", fade.toFixed(2));
    // a node that is down fades back, and comes back when it is started again
    layers.lanes.forEach((g, i) => g?.setAttribute("opacity", laneOpacity(r, i, t).toFixed(2)));
    const text = storyOf(r, t) + (paused ? " · paused" : "");
    if (readout && readout.textContent !== text) readout.textContent = text;
  }
  function choose(sc, m) {
    scenario = sc;
    mode = m;
    for (const b of controls?.querySelectorAll("[data-scenario]") ?? []) b.setAttribute("aria-checked", String(b.dataset.scenario === scenario));
    for (const b of controls?.querySelectorAll("[data-mode]") ?? []) b.setAttribute("aria-checked", String(b.dataset.mode === mode));
  }
  function tick(now) {
    const dt = (last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60) * (Number(stage.dataset.speed) || 1);
    last = now;
    if (!paused) {
      t += dt;
      idle += dt;
      if (t >= rec().loop) {
        t = 0;
        if (idle >= IDLE) { tour = (tour + 1) % TOUR.length; choose(...TOUR[tour]); }
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
    if (b.dataset.scenario) choose(b.dataset.scenario, mode);
    if (b.dataset.mode) choose(scenario, b.dataset.mode);
    t = 0;
    paused = false;
    render();
    run();
  }
  const onKey = (e) => { idle = 0; if (e.key === " ") { e.preventDefault(); paused = !paused; if (!paused) run(); else render(); } };
  const onMove = () => { idle = 0; };
  const observer = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  observer.observe(stage);
  stage.addEventListener("keydown", onKey);
  stage.addEventListener("pointermove", onMove);
  controls?.addEventListener("click", onClick);
  // for checks and stills: a scenario, a mode and a moment, paused
  stage.pick = (sc, m, at) => { choose(sc, m); t = at; paused = true; render(); };
  // from the start, running: the series page's RESTART button
  stage.restart = () => { t = data.t0 ?? 1; paused = false; render(); run(); };
  choose(scenario, mode);
  render();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    stage.removeEventListener("keydown", onKey);
    stage.removeEventListener("pointermove", onMove);
    controls?.removeEventListener("click", onClick);
  };
}
