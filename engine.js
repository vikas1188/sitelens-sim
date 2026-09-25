export class ScenarioPlayer {
  constructor({ physics, behaviors, onChange, onHazard }) {
    Object.assign(this, { physics, behaviors, onChange, onHazard });
    this.state = "ready";
    this.time = 0;
    this.index = 0;
    this.eventIndex = -1;
    this.completed = new Set();
    this.hazardMoment = null;
    this.eventTimestamp = null;
    this.reason = null;
  }
  select(scenario) {
    this.physics.reset();
    this.scenario = scenario;
    this.time = 0;
    this.eventIndex = -1;
    this.hazardMoment = null;
    this.eventTimestamp = null;
    this.reason = null;
    this.state = "ready";
    this.behavior = this.behaviors[scenario.id];
    this.behavior?.setup();
    this.onChange(this);
  }
  play() {
    if (this.state === "paused") {
      this.state = "running";
    } else {
      this.select(this.scenario);
      this.state = "running";
    }
    this.onChange(this);
  }
  pause() {
    if (this.state === "running") this.state = "paused";
    else if (this.state === "paused") this.state = "running";
    this.onChange(this);
  }
  free() {
    if (this.state === "running") this.state = "paused";
    this.onChange(this);
  }
  hazard(reason) {
    if (this.state !== "running") return;
    this.state = "frozen";
    this.hazardMoment = this.time;
    this.eventTimestamp = new Date().toISOString();
    this.reason = reason;
    this.completed.add(this.scenario.id);
    this.onChange(this);
    this.onHazard(this);
  }
  tick(dt) {
    if (this.state !== "running") return;
    this.time += dt;
    const events = this.scenario.timeline;
    while (
      this.eventIndex + 1 < events.length &&
      events[this.eventIndex + 1].t <= this.time
    ) {
      this.eventIndex++;
      this.behavior?.action?.(this.eventIndex);
      this.onChange(this);
    }
    this.behavior?.update?.(this.time, dt);
    if (this.state === "running") this.physics.step(dt);
    this.behavior?.sync?.();
    if (this.time > 18 && this.state === "running") {
      this.state = "failed";
      this.onChange(this);
    }
  }
}
