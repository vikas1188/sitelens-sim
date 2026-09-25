const frame = document.querySelector("iframe");
const output = document.querySelector("#results");
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  output.textContent = results
    .map(
      (r) =>
        `${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? " — " + r.detail : ""}`,
    )
    .join("\n");
  output.className = results.every((r) => r.ok) ? "pass" : "fail";
}
const deadline = Date.now() + 20000;
while (!frame.contentWindow.__sim && Date.now() < deadline)
  await new Promise((r) => setTimeout(r, 100));
try {
  const sim = frame.contentWindow.__sim;
  if (!sim) throw new Error("App did not initialize. Check CDN connectivity.");
  const { player, select, scenarios, physics, site } = sim;
  const doc = frame.contentDocument;
  const advance = (seconds) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) player.tick(1 / 60);
  };
  const snapshot = () =>
    JSON.stringify(
      physics.world.bodies.map((b) => [
        b.position.x,
        b.position.y,
        b.position.z,
        b.quaternion.x,
        b.quaternion.y,
        b.quaternion.z,
        b.quaternion.w,
      ]),
    );
  check(
    "Five scenario buttons",
    doc.querySelectorAll(".scenario").length === 5,
  );
  const expected = [
    "load-contact",
    "vehicle-worker-contact",
    "worker-ground-contact",
    "load-worker-pinch-contact",
    "ladder-line-proximity",
  ];
  const firstTimes = [];
  for (let repeat = 0; repeat < 2; repeat++) {
    for (const [i, s] of scenarios.entries()) {
      doc.querySelector(`[data-id="${s.id}"]`).click();
      check(
        `${s.id}: clean reset ${repeat + 1}`,
        player.state === "ready" &&
          player.time === 0 &&
          physics.world.constraints.length === 1,
      );
      doc.querySelector("#play").click();
      advance(0.5);
      doc.querySelector("#play").click();
      const paused = snapshot(),
        time = player.time;
      advance(1);
      check(
        `${s.id}: pause holds physics`,
        player.state === "paused" &&
          time === player.time &&
          paused === snapshot(),
      );
      doc.querySelector("#play").click();
      for (let n = 0; n < 1100 && player.state === "running"; n++)
        player.tick(1 / 60);
      check(
        `${s.id}: real hazard within 10–15s`,
        player.state === "frozen" && player.time >= 10 && player.time <= 15,
        `${player.reason} at ${player.time.toFixed(3)}s`,
      );
      check(
        `${s.id}: expected physical trigger`,
        player.reason === expected[i],
      );
      check(
        `${s.id}: complete alert`,
        !doc.querySelector("#alert").hidden &&
          doc.querySelector("#alert").textContent.includes(s.violation_type) &&
          !!doc.querySelector('#alert a[href^="https://www.osha.gov/"]') &&
          !!doc.querySelector(".prevention"),
      );
      const frozen = snapshot(),
        frozenTime = player.time;
      advance(1);
      check(
        `${s.id}: freeze holds scene`,
        snapshot() === frozen && player.time === frozenTime,
      );
      if (repeat === 0) firstTimes[i] = player.time;
      else
        check(
          `${s.id}: deterministic replay`,
          Math.abs(player.time - firstTimes[i]) < 0.02,
        );
    }
  }
  check("All five counted once", player.completed.size === 5);
  doc.querySelector("#inspect").click();
  check(
    "Inspect frozen scene",
    doc.querySelector("#alert").hidden &&
      !doc.querySelector("#show-alert").hidden,
  );
  doc.querySelector("#show-alert").click();
  check("Restore alert", !doc.querySelector("#alert").hidden);
  doc.querySelector("#next").click();
  check(
    "Next scenario wraps and runs",
    player.scenario.id === "load" && player.state === "running",
  );
  doc.querySelector("#orbit").click();
  check(
    "Free orbit pauses playback",
    player.state === "paused" &&
      doc.querySelector("#orbit").classList.contains("active"),
  );
  doc.querySelector("#replay").click();
  check("Replay starts fresh", player.state === "running" && player.time === 0);
  // Disable collision callbacks to prove a timer cannot manufacture an impact.
  physics.onContact(() => {});
  advance(18.1);
  check(
    "Missing collision reports failure, never an alert",
    player.state === "failed" && doc.querySelector("#alert").hidden,
  );
  select(scenarios[0]);
  player.play();
  const x = physics.load.position.x;
  advance(0.5);
  check(
    "Suspended load moves under physics",
    Math.abs(physics.load.position.x - x) > 0.1 &&
      physics.world.constraints.length === 1,
  );
  player.pause();
  check(
    "Scene coordinates remain finite",
    physics.world.bodies.every((b) =>
      [b.position.x, b.position.y, b.position.z].every(Number.isFinite),
    ),
  );
  check(
    "No extra dynamic bodies after reset",
    physics.world.bodies.length === 4,
  );
} catch (error) {
  check("Test runner", false, error.stack);
}
window.testResults = {
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  results,
};
output.textContent += `\n\n${window.testResults.passed} passed / ${window.testResults.failed} failed`;
