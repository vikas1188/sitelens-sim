// All interface copy, scenario explanations, citations and simulated alerts live here.
export const ui = {
  sceneLabel:
    "Interactive construction site. Drag to orbit, scroll to zoom, or focus the scene and use arrow keys to pan.",
  brand: "SiteLens",
  sim: "SIM",
  tagline: "See the risk. Change the outcome.",
  eyebrow: "THE FOCUS FOUR / INTERACTIVE LAB",
  headline: "Safety starts\nwith seeing.",
  intro:
    "Five moments. Four critical hazards. Explore what happens when a safety protocol is missed.",
  library: "CHOOSE A SCENARIO",
  demo: "SIMULATED ENVIRONMENT",
  footer: "Built for awareness. Designed for prevention.",
  disclaimer:
    "Illustrative training demo · Alerts are simulated, not live detections.",
  ready: "READY TO EXPLORE",
  running: "SIMULATION RUNNING",
  paused: "SIMULATION PAUSED",
  frozen: "HAZARD CAPTURED",
  free: "FREE ORBIT",
  play: "Run scenario",
  pause: "Pause",
  resume: "Resume",
  replay: "Replay",
  next: "Next scenario",
  orbit: "Free orbit",
  reset: "Reset view",
  view: "SITE 01 / NORTH YARD",
  drag: "Drag to orbit · Scroll to zoom",
  statusReady: "Select a scenario, then press Run.",
  observe: "Observe the highlighted zone.",
  alert: "ALERT FIRED",
  simulated: "SIMULATED DETECTION",
  prevent: "WHAT PREVENTS THIS",
  guideline: "OSHA GUIDELINE",
  event: "EVENT TIMELINE",
  start: "Observe",
  risk: "Risk develops",
  impact: "Hazard",
  close: "Inspect scene",
  return: "Show alert",
  loading: "Preparing your construction site…",
  error:
    "The 3D site could not load. Check your internet connection and WebGL support, then reload.",
  timeout: "The hazard did not complete. Replay to reset the simulation.",
  zone: "Zone",
  violation: "Violation type",
  severity: "Severity",
  timestamp: "Timestamp",
  critical: "CRITICAL",
  focus: ["Struck-by", "Falls", "Caught-in/between", "Electrocution"],
  focusLabel: "OSHA FOCUS FOUR",
  complete: "SCENARIOS EXPLORED",
  failed: "SIMULATION INTERRUPTED",
};
const standard = (number) =>
  `https://www.osha.gov/laws-regs/regulations/standardnumber/1926/${number}`;
export const scenarios = [
  {
    id: "load",
    number: "01",
    category: "STRUCK-BY",
    title: "Under the load",
    subtitle: "Crane fall zone",
    duration: 12,
    zone: "ZONE-A",
    violation_type: "WORKER_UNDER_LOAD",
    severity: "CRITICAL",
    description:
      "A suspended steel load moves above an occupied work zone. Watch the worker inside the red fall zone.",
    wrong:
      "A worker remains in the fall zone beneath a suspended load. When the rigging releases, the load falls into the occupied area.",
    citation: "29 CFR 1926.1425 — Keeping clear of the load",
    url: standard("1926.1425"),
    guideline:
      "Keep employees clear of suspended loads and restrict entry into the fall zone.",
    prevention:
      "Barricade the fall zone, plan the lift route, and keep workers clear of the suspended load.",
    camera: [30, 24, 30],
    target: [1, 6, -3],
    timeline: [
      { t: 0, text: "Worker inside the fall zone" },
      { t: 3, text: "Crane slewing · load in motion" },
      { t: 9.6, text: "Rigging released · falling load" },
    ],
  },
  {
    id: "vehicle",
    number: "02",
    category: "STRUCK-BY",
    title: "Out of sight",
    subtitle: "Vehicle blind spot",
    duration: 12,
    zone: "ZONE-B",
    violation_type: "WORKER_IN_REVERSE_PATH",
    severity: "CRITICAL",
    description:
      "A flatbed reverses with an obstructed rear view and no spotter or reverse alarm. A worker stands in its blind spot.",
    wrong:
      "The reversing truck reaches a worker in its blind spot. No reverse alarm or observer is used to protect the backing path.",
    citation: "29 CFR 1926.601(b)(4) — Reversing with an obstructed view",
    url: standard("1926.601"),
    guideline:
      "When rear visibility is obstructed, use an audible reverse alarm or back up only when an observer signals it is safe.",
    prevention:
      "Separate pedestrians from vehicle routes. Use the required reverse alarm or an observer, and check the path before backing.",
    camera: [24, 22, 37],
    target: [0, 1, 12],
    timeline: [
      { t: 0, text: "Worker in the blind spot" },
      { t: 1, text: "Truck reversing · no spotter" },
      { t: 8, text: "Separation distance closing" },
    ],
  },
  {
    id: "fall",
    number: "03",
    category: "FALL",
    title: "One step too far",
    subtitle: "Unguarded slab edge",
    duration: 12,
    zone: "ZONE-C",
    violation_type: "UNPROTECTED_EDGE",
    severity: "CRITICAL",
    description:
      "A worker crosses an elevated slab toward an open edge. There is no guardrail, safety net, or personal fall arrest system.",
    wrong:
      "A worker walks beyond an unprotected slab edge and falls to the level below.",
    citation: "29 CFR 1926.501(b)(1) — Unprotected sides and edges",
    url: standard("1926.501"),
    guideline:
      "Protect workers at unprotected sides or edges 6 feet or more above lower levels using guardrails, safety nets, or personal fall arrest systems.",
    prevention:
      "Install edge protection before access, or provide an appropriate safety net or personal fall arrest system.",
    camera: [8, 18, -18],
    target: [-10, 4, -7],
    timeline: [
      { t: 0, text: "Elevated slab · unprotected edge" },
      { t: 2, text: "Worker approaching the opening" },
      { t: 9.8, text: "Worker crosses slab edge" },
    ],
  },
  {
    id: "caught",
    number: "04",
    category: "CAUGHT-IN / BETWEEN",
    title: "No room to move",
    subtitle: "Load and wall pinch point",
    duration: 12,
    zone: "ZONE-D",
    violation_type: "LOAD_PINCH_POINT",
    severity: "CRITICAL",
    description:
      "A worker stands between a wall and a suspended load. The load swings into the narrow clearance.",
    wrong:
      "A swinging load reaches a worker trapped against a fixed wall. The worker has no clear escape path.",
    citation: "29 CFR 1926.1425(a) — Hoisting routes and employee exposure",
    url: standard("1926.1425"),
    guideline:
      "Use hoisting routes that minimize employee exposure to hoisted loads, to the extent consistent with public safety.",
    prevention:
      "Keep the load route clear, isolate pinch points, and position workers outside the swing path.",
    camera: [-3, 12, 18],
    target: [5, 2, -5],
    timeline: [
      { t: 0, text: "Worker inside the pinch point" },
      { t: 7.8, text: "Load released into swing path" },
      { t: 9, text: "Clearance narrowing against wall" },
    ],
  },
  {
    id: "electric",
    number: "05",
    category: "ELECTROCUTION",
    title: "Too close for comfort",
    subtitle: "Overhead power line",
    duration: 12,
    zone: "ZONE-E",
    violation_type: "ENERGIZED_LINE_PROXIMITY",
    severity: "CRITICAL",
    description:
      "A worker raises a conductive ladder near an overhead line. The red envelope illustrates a proximity warning, not a regulatory clearance distance.",
    wrong:
      "The raised ladder enters the simulated warning envelope around an energized overhead line, creating an electrocution risk.",
    citation: "29 CFR 1926.1053(b)(12) — Nonconductive ladder siderails",
    url: standard("1926.1053"),
    guideline:
      "Use nonconductive siderails where the worker or ladder could contact exposed energized electrical equipment, subject to the standard’s exceptions.",
    prevention:
      "Plan work away from energized lines; arrange de-energization or suitable protection and use the required nonconductive ladder.",
    camera: [31, 22, 15],
    target: [13, 6, -17],
    timeline: [
      { t: 0, text: "Conductive ladder below power lines" },
      { t: 2, text: "Worker raising ladder" },
      { t: 9, text: "Ladder nearing energized line" },
    ],
  },
];
