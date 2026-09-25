# SiteLens Sim

A standalone, low-poly construction-site safety diorama. Five interactive scenarios illustrate OSHA's Focus Four. All geometry is procedural; there are no model, texture, font, or image downloads. Vanilla ES modules, Three.js 0.160.1, and cannon-es 0.20.0 load through a pinned CDN import map. **No build, framework, bundler, or npm install.**

## Run

From this folder:

```sh
python3 serve.py
```

Open the URL printed in the terminal (normally http://localhost:8000). If that port is occupied, the server tries successive ports through 8100. An optional starting port is supported: `python3 serve.py 8050`.

Alternatively, use `python3 -m http.server 8000`. ES modules need HTTP: double-clicking `index.html` with a `file://` URL is not supported. Internet access is needed for the two pinned CDN libraries. The UI reports a loading error when those libraries or WebGL cannot initialize.

## Demo flow

1. Choose a scenario in the left rail (horizontal scroll on a phone).
2. Press **Run scenario**. Each sequence takes about 10–12 seconds.
3. Drag to orbit and scroll/pinch to zoom. Focus the scene and use arrow keys to pan.
4. A physical contact or proximity event freezes the simulation and displays a simulated alert, OSHA reference, and prevention guidance.
5. **Inspect scene** hides the card; **Show alert** restores it. **Next scenario** advances and runs; **Replay** fully resets the current scenario.

**Pause** holds physics and the timeline. **Free orbit** pauses a running sequence so you can inspect it. **Reset view** restores the scenario camera. Switching browser tabs pauses playback. Reduced-motion preferences suppress the red impact flash and decorative worker movement, marker pulsing, and CSS animations; the user-triggered physics demonstration still moves.

| Scenario              | Trigger                                   | Verified duration |
| --------------------- | ----------------------------------------- | ----------------- |
| Under the load        | Falling rigid load contacts worker        | 10.70 s           |
| Out of sight          | Reversing truck contacts worker           | 10.70 s           |
| One step too far      | Falling worker contacts ground            | 11.12 s           |
| No room to move       | Swinging load contacts worker beside wall | 10.23 s           |
| Too close for comfort | Ladder tip enters line proximity envelope | 11.68 s           |

The crane load uses a Cannon distance constraint and momentum. Truck movement is kinematic, while contact with the worker is detected by Cannon. The falling worker becomes a dynamic rigid body. The electrical scenario uses geometric proximity, **not a simulated electrocution or electrical arc**. Impacts show a brief red flash and a frozen, non-graphic scene.

## Deploy without a build

The runtime files are `index.html`, `styles.css`, `app.js`, `scene.js`, `physics.js`, `engine.js`, `simulations.js`, and `scenarios.js`. Keep them together; all local URLs are relative, including on a GitHub Pages project subpath.

For GitHub Pages:

1. Upload these files and `.nojekyll` into a repository root using **Add file → Upload files**, or push this repository.
2. In **Settings → Pages**, choose **Deploy from a branch**, the `main` branch, and `/ (root)`.
3. Open the URL GitHub provides after deployment completes.

GitHub Pages does not provide a direct folder-drop deployment endpoint. The same runtime folder can be dropped into a static host that does support folder uploads. A ready-to-upload ZIP is available in `output/sitelens-sim.zip` after packaging; extract it before uploading to Pages. There is no server-side code or secret configuration.

## Edit and extend

- `scenarios.js`: all product copy, descriptions, event captions, alert fields, camera presets, prevention text, and official OSHA links.
- `scene.js`: procedural geometry, lighting, camera, orbit controls, resize behavior.
- `physics.js`: fixed-step world, load constraint, transient colliders, contact callbacks, reset/disposal.
- `simulations.js`: per-scenario `setup`, timeline `action`, `update`, and post-physics `sync` hooks.
- `engine.js`: timeline and ready/running/paused/frozen/failed state machine. `hazardMoment` records the actual event time, not a timer-based impact.
- `app.js`: interface, controls, alert presentation, animation loop, load-error feedback.
- `styles.css`: responsive layout and reduced-motion styling.

The engine steps at 60 Hz with a bounded accumulator. Rendering runs at the display refresh rate. Pixel ratio is capped at 2; a single directional shadow map is used. A local Chrome sample at 1366 × 768 measured roughly 120 fps with about 5,540 visible triangles. This is a local measurement, not a guarantee on other hardware.

## Verification

Open http://localhost:8000/tests.html. The dependency-free browser test harness runs the actual app in an iframe, exercises all five scenarios twice using the same fixed-step physics, and reports **76 assertions**. It checks scenario timing, correct physical triggers, alert fields and OSHA links, deterministic replay, pause/freeze invariants, next-scenario wrapping, free orbit, replay, finite coordinates, and reset body counts. It also disables collision callbacks to verify that the engine reports failure instead of inventing an impact after a timeout.

For manual smoke testing, run all five with the visible controls, inspect the frozen geometry, replay, orbit, resize, and check the browser console. Automated browser verification also covered full real-time runs of all five scenarios, 1366 × 768 laptop layout, 390 px mobile layout, and a clean console after reload. Test results and screenshots are under ignored `output/`; tests are not needed for deployment.

## Scope and sources

This is illustrative safety-awareness software, not live computer-vision detection, a certified training course, a compliance determination, or an engineering simulation. Alert timestamps record the browser's UTC time and elapsed scenario time. The red electrical envelope is a demonstrative proximity threshold, not a regulatory clearance distance. The physical world includes the surfaces and colliders needed by each scenario, not a fully collidable digital twin of every decorative object.

Official sources reviewed for the scenario copy:

- [29 CFR 1926.1425 — Keeping clear of the load](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.1425)
- [29 CFR 1926.601(b)(4) — Backing with obstructed visibility](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.601)
- [29 CFR 1926.501(b)(1) — Unprotected sides and edges](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.501)
- [29 CFR 1926.1053(b)(12) — Ladder siderails near energized equipment](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.1053)

The references include qualifications and exceptions; each alert links to the full standard. Alerts and site geometry are intentionally simplified for the hackathon demonstration.
