// Live behaviour of Fig 6: replication through the object store, in seconds. Commits fill
// the primary's open WAL segment; uploads land in the replication bay and update
// index.msgpack; each replica polls, downloads what is new and applies it. When nobody is
// driving, the load switches between light and heavy on its own. Space pauses.
// `stage` is the .iso-stage element, `data` = { P, uFix, warm }, `k` the iso kit, `G` the lathe kit.
import { makeParts } from "../fig1-partitions/parts.mjs";
import { LOADS, SPEED, TUNINGS, makeSim } from "./repl.mjs";
import { makeWal } from "./wal.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const TOUR_STEP = 22; // seconds between load changes when idle
const IDLE = 12;

export function mount(stage, data, k, G) {
  const { P } = data;
  const parts = makeParts(k, G, P);
  const wal = makeWal(k, P, parts);
  const svg = stage.querySelector("svg");
  const figure = stage.closest(".iso-figure");
  const one = (name) => svg.querySelector(`[data-part="${name}"]`);
  const layers = {
    hand: one("hand"), bay3: one("bay3"), flying3: one("flying3"), pings: one("pings"), gauge: one("gauge"), names: one("names"), feed: one("feed"),
    lamps: [0, 1, 2].map((i) => one("lamp-" + i)),
  };
  const readout = figure?.querySelector("[data-readout]");
  const controls = figure?.querySelector(".sa-grain");
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  let load = "light";
  let tuning = "fast";
  let sim = makeSim(load, 0, tuning);
  sim.step(data.warm ?? 0);
  let paused = false;
  let frame = 0, last = 0, visible = false, feedPhase = 0;
  let idle = IDLE, sinceStep = 0;
  const written = new Map();
  const put = (el, html) => { if (el && written.get(el) !== html) { el.innerHTML = html; written.set(el, html); } };

  // The benches hold still: a few seconds do not move a day partition. Only the rows
  // flowing into the primary and the WAL move.
  function draw() {
    const w = wal(sim);
    put(layers.bay3, w.bay);
    put(layers.flying3, w.flying);
    put(layers.pings, w.pings);
    put(layers.gauge, w.gauge);
    put(layers.names, w.labels);
    put(layers.feed, parts.feedSvg(feedPhase));
    w.lamps.forEach((lamp, i) => put(layers.lamps[i], lamp));
    layers.hand?.setAttribute("d", w.hand);
    const lags = sim.s.replicas.map((r) => { const l = sim.lagOf(r); return `replica ${r.i} ${l.txns ? l.seconds.toFixed(1) + " s behind" : "up to date"}`; });
    const text = `${LOADS[load].label} · ${TUNINGS[tuning].label}${SPEED > 1 ? " · " + SPEED + "x speed" : ""} · segment ${sim.s.seg.id} open · ${lags.join(" · ")}${paused ? " · paused" : ""}`;
    if (readout && readout.textContent !== text) readout.textContent = text;
  }

  function choose(l, tu = tuning) {
    if (tu !== tuning) { tuning = tu; sim.setTuning(tu); }
    for (const b of controls?.querySelectorAll("[data-tuning]") ?? []) b.setAttribute("aria-checked", String(b.dataset.tuning === tuning));
    if (l !== load) { load = l; sim.setLoad(l); }
    for (const b of controls?.querySelectorAll("[data-load]") ?? []) b.setAttribute("aria-checked", String(b.dataset.load === load));
  }
  const touch = () => { idle = 0; sinceStep = 0; };
  function tour(dt) {
    idle += dt;
    sinceStep += dt;
    if (idle < IDLE || sinceStep < TOUR_STEP) return;
    sinceStep = 0;
    choose(load === "light" ? "heavy" : "light");
  }
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    // rows ride the feed faster under heavy load
    if (!paused) { sim.step(dt * SPEED); feedPhase += dt * (load === "heavy" ? 2.2 : 0.5); tour(dt); }
    draw();
    frame = visible && !paused && !still.matches ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };

  function onClick(e) {
    const b = e.target.closest?.("[data-load], [data-tuning]");
    if (!b) return;
    touch();
    if (b.dataset.tuning) choose(load, b.dataset.tuning);
    else choose(b.dataset.load);
    draw();
  }
  const onMove = () => touch();
  const onKey = (e) => { touch(); if (e.key === " ") { e.preventDefault(); paused = !paused; if (!paused) run(); else draw(); } };
  const observer = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  observer.observe(stage);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("keydown", onKey);
  controls?.addEventListener("click", onClick);
  // for checks and stills: a load, then run the simulation forward, paused
  stage.pick = (l, seconds = 0) => { choose(l); sim.step(seconds); paused = true; draw(); };
  // from the start, running: the series page's RESTART button
  stage.restart = () => { sim = makeSim(load, 0, tuning); sim.step(data.warm ?? 0); paused = false; draw(); run(); };
  choose(load);
  draw();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    stage.removeEventListener("pointermove", onMove);
    stage.removeEventListener("keydown", onKey);
    controls?.removeEventListener("click", onClick);
  };
}
