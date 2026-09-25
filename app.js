import { ui, scenarios } from "./scenarios.js";
const $ = (s) => document.querySelector(s);
$("#app").innerHTML =
  `<header><a class="brand" href="./" aria-label="${ui.brand}"><span class="brand-icon">◈</span>${ui.brand}<span class="sim">${ui.sim}</span></a><span class="tagline">${ui.tagline}</span><span class="demo"><i></i>${ui.demo}</span></header><div class="workspace"><aside><div class="eyebrow">${ui.eyebrow}</div><h1>${ui.headline.replace("\n", "<br> ")}</h1><p class="intro">${ui.intro}</p><div class="list-label">${ui.library}<span>05</span></div><nav aria-label="${ui.library}">${scenarios.map((s) => `<button class="scenario" data-id="${s.id}" aria-pressed="false"><span class="number">${s.number}</span><span><small>${s.category}</small><strong>${s.title}</strong><em>${s.subtitle}</em></span><span class="arrow">↗</span></button>`).join("")}</nav><div class="aside-bottom"><span>${ui.focusLabel}</span><div class="focus-list">${ui.focus.map((f, i) => `<span><b>0${i + 1}</b>${f}</span>`).join("")}</div></div></aside><section class="simulation"><div class="stage"><div id="viewport" aria-label="${ui.sceneLabel}"><div id="loading" role="status">${ui.loading}</div></div><div class="scene-top"><span class="site-name">${ui.view}</span><span class="state" id="state">${ui.ready}</span></div><div class="scene-bottom"><span class="scene-legend"><i></i><span id="zone-label"></span></span><span class="orbit-hint">${ui.drag}</span><button id="reset-view" title="${ui.reset}" aria-label="${ui.reset}">⌖</button></div><div id="flash" aria-hidden="true"></div><section id="alert" class="alert" aria-label="${ui.alert}" hidden></section></div><div class="playback"><div class="playback-title"><div><small id="category"></small><h2 id="title"></h2></div><p id="description"></p></div><div class="timeline-top"><span>${ui.event}</span><span id="clock">00:00 / 00:12</span></div><div class="progress" role="progressbar" aria-label="${ui.event}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="progress-fill"></div><i style="left:25%"></i><i style="left:75%"></i></div><div class="timeline-labels"><span>${ui.start}</span><span>${ui.risk}</span><span>${ui.impact}</span></div><div class="controls"><button class="primary" id="play">▶ &nbsp;${ui.play}</button><button id="replay">↻ &nbsp;${ui.replay}</button><button id="orbit">◎ &nbsp;${ui.orbit}</button><span class="event-status" id="event-status" role="status" aria-live="polite">${ui.statusReady}</span></div></div></section></div><footer><span>${ui.footer}</span><span>${ui.disclaimer}</span><span id="completed">0 / 5 ${ui.complete}</span></footer>`;
try {
  const [
    { createScene, buildSite },
    { createPhysics },
    { ScenarioPlayer },
    { createBehaviors },
  ] = await Promise.all([
    import("./scene.js"),
    import("./physics.js"),
    import("./engine.js"),
    import("./simulations.js"),
  ]);
  const view = createScene($("#viewport")),
    site = buildSite(view.scene),
    physics = createPhysics(site);
  view.renderer.domElement.setAttribute("aria-label", ui.sceneLabel);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) view.controls.enableDamping = false;
  let player,
    freeOrbit = false;
  const cameraFor = (s) => {
    view.camera.position.set(...s.camera);
    view.controls.target.set(...s.target);
    view.controls.update();
  };
  const hideAlert = () => {
    $("#alert").hidden = true;
  };
  function change(p) {
    const s = p.scenario;
    for (const b of document.querySelectorAll(".scenario")) {
      b.classList.toggle("selected", b.dataset.id === s.id);
      b.setAttribute("aria-pressed", String(b.dataset.id === s.id));
      b.classList.toggle("completed", p.completed.has(b.dataset.id));
    }
    $("#category").textContent = `${s.number} / ${s.category}`;
    $("#title").textContent = s.title;
    $("#description").textContent = s.description;
    $("#zone-label").textContent = `${s.zone} / ${s.subtitle}`;
    $("#state").textContent = freeOrbit ? ui.free : ui[p.state] || ui.ready;
    $("#state").classList.toggle("danger", p.state === "frozen");
    $("#play").textContent =
      p.state === "running"
        ? `Ⅱ  ${ui.pause}`
        : p.state === "paused"
          ? `▶  ${ui.resume}`
          : `▶  ${ui.play}`;
    $("#event-status").textContent =
      p.state === "failed"
        ? ui.timeout
        : p.state === "frozen"
          ? ui.frozen
          : p.eventIndex >= 0
            ? s.timeline[p.eventIndex].text
            : ui.statusReady;
    $("#completed").textContent = `${p.completed.size} / 5 ${ui.complete}`;
  }
  function showAlert(p) {
    const s = p.scenario;
    $("#alert").innerHTML =
      `<div class="alert-heading"><span class="alert-symbol">!</span><div><small>${s.category} / ${ui.frozen}</small><h3>${s.title}</h3></div><button id="inspect">${ui.close} ↗</button></div><div class="alert-columns"><div><p>${s.wrong}</p><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.citation} ↗</a><p class="guideline">${s.guideline}</p></div><div class="alert-data"><div class="alert-label"><strong>${ui.alert}</strong><span>${ui.simulated}</span></div><dl><dt>${ui.zone}</dt><dd>${s.zone}</dd><dt>${ui.violation}</dt><dd>${s.violation_type}</dd><dt>${ui.severity}</dt><dd class="critical">${s.severity}</dd><dt>${ui.timestamp}</dt><dd>${p.eventTimestamp.slice(11, 19)} UTC · T+${p.hazardMoment.toFixed(2)}s</dd></dl></div></div><div class="prevention"><p><small>${ui.prevent}</small>${s.prevention}</p><button id="next" class="primary">${ui.next} →</button></div>`;
    $("#alert").hidden = false;
    $("#inspect").onclick = () => {
      hideAlert();
      $("#event-status").textContent = ui.frozen;
      $("#show-alert").hidden = false;
    };
    $("#next").onclick = () => {
      select(scenarios[(scenarios.indexOf(s) + 1) % scenarios.length]);
      player.play();
    };
  }
  player = new ScenarioPlayer({
    physics,
    behaviors: createBehaviors({
      reducedMotion,
      site,
      physics,
      hazard: (r) => player.hazard(r),
    }),
    onChange: change,
    onHazard: (p) => {
      showAlert(p);
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        $("#flash").classList.remove("fire");
        void $("#flash").offsetWidth;
        $("#flash").classList.add("fire");
      }
      $("#show-alert").hidden = true;
    },
  });
  const showButton = document.createElement("button");
  showButton.id = "show-alert";
  showButton.textContent = ui.return;
  showButton.hidden = true;
  $(".controls").append(showButton);
  showButton.onclick = () => {
    showAlert(player);
    showButton.hidden = true;
  };
  function select(s) {
    freeOrbit = false;
    $("#orbit").classList.remove("active");
    hideAlert();
    showButton.hidden = true;
    player.select(s);
    cameraFor(s);
  }
  for (const b of document.querySelectorAll(".scenario"))
    b.onclick = () => select(scenarios.find((s) => s.id === b.dataset.id));
  $("#play").onclick = () => {
    freeOrbit = false;
    $("#orbit").classList.remove("active");
    if (["running", "paused"].includes(player.state)) player.pause();
    else {
      hideAlert();
      showButton.hidden = true;
      player.play();
    }
  };
  $("#replay").onclick = () => {
    select(player.scenario);
    player.play();
  };
  $("#orbit").onclick = () => {
    freeOrbit = !freeOrbit;
    $("#orbit").classList.toggle("active", freeOrbit);
    player.free();
    if (freeOrbit) hideAlert();
    if (player.state === "frozen") showButton.hidden = false;
  };
  $("#reset-view").onclick = () => {
    cameraFor(player.scenario);
    $("#event-status").textContent = ui.reset;
  };
  select(scenarios[0]);
  $("#loading").remove();
  let last = performance.now(),
    acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    acc += Math.min((now - last) / 1000, 0.1);
    last = now;
    while (acc >= 1 / 60) {
      player.tick(1 / 60);
      acc -= 1 / 60;
    }
    const pct = Math.min(player.time / player.scenario.duration, 1) * 100;
    $("#progress-fill").style.transform = `scaleX(${pct / 100})`;
    $(".progress").setAttribute("aria-valuenow", Math.round(pct));
    $("#clock").textContent =
      `00:${String(Math.floor(player.time)).padStart(2, "0")} / 00:${player.scenario.duration}`;
    if (player.state === "running" && !reducedMotion)
      site.marker.material.opacity = 0.5 + 0.35 * Math.sin(player.time * 4);
    view.render();
  }
  requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && player.state === "running") player.pause();
    last = performance.now();
    acc = 0;
  });
  window.__sim = { view, site, physics, player, select, scenarios };
} catch (error) {
  console.error(error);
  $("#loading").textContent = ui.error;
  $("#loading").classList.add("load-error");
  for (const b of document.querySelectorAll("button")) b.disabled = true;
}
