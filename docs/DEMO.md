# SiteLens — submission and demo

**Live:** https://sitelens-sim.vercel.app/ · **Code:** https://github.com/vikas1188/sitelens-sim

## Submission summary

**Tagline:** AI that spots construction-site hazards, helps a human confirm them, tracks the fix, and produces an OSHA-aligned record.

**Problem.** The OSHA "Focus Four" (falls, struck-by, caught-in/between, electrocution) cause most construction deaths. Site safety checks are manual and intermittent, and often go unrecorded. Camera AI alone doesn't solve this: it produces false alarms, can't establish legal facts, and doesn't close the loop from "hazard seen" to "hazard fixed".

**What SiteLens does.**
1. **Detects:** a phone or laptop camera frame is analysed by **Liquid LFM2.5-VL-450M**, running locally on the laptop, for PPE and hazard evidence. Five physics-based 3D simulations (suspended load, reversing truck, unprotected edge, pinch point, ladder near a power line) generate hazards for training and demos.
2. **Grounds:** every alert maps to one of eight OSHA rules. **Nimble** retrieved and checked each rule against the official OSHA source text; the source URL, applicability limits and a content fingerprint are kept.
3. **Keeps a human in the loop:** a reviewer marks each alert **Confirm**, **False alarm** or **Acknowledge**. A false-alarm verdict can teach a zone-specific suppression rule, but only when the human verdict and the detector's known confidence both allow it. The system never silences an alert on its own.
4. **Closes the loop:** a corrective action needs an owner and a due date, and it closes only with a verifier and an actual completion time. Acknowledging an alert is not the same as fixing it.
5. **Records:** the inspection record downloads as **TXT or Word (.docx)**, with fields aligned to OSHA hazard-identification guidance and Cal/OSHA Title 8 sections 3203 and 1509. Missing facts are marked as missing, not invented. Captured-frame thumbnails and reviewer-entered person labels appear alongside alerts.

**Sponsor technology**
- **Liquid AI:** real on-device vision inference (llama.cpp). The hosted app reaches it through an authenticated outbound edge worker, so frames never go to a third-party model.
- **RawTree:** a complete, append-only evidence log, with SQL deduplication and joins that show each alert's latest review and correction. Reports refuse to generate from truncated evidence.
- **Nimble:** retrieves and checks the official OSHA source text behind each rule mapping.
- Also used: TypeSafe **Jev** for typed triage (with a labelled deterministic fallback), and **Vercel** plus private Blob storage for hosting and durable state.

**Honest limits.** The reports are inspection and corrective-action records. They are not OSHA 300/301 injury logs and do not certify compliance. The model does not identify people. Live camera inference requires the laptop running the model and worker to be online. Simulation events are labelled as simulated and are excluded from reports by default.

**Verification.** 71 automated tests (66 pass, 5 live-service tests are opt-in and skipped by default) and a 76-assertion browser harness for the physical simulations.

## 3-minute video script

| Time | Show | Say |
|---|---|---|
| 0:00–0:20 | Landing dashboard | "Most construction deaths come from the OSHA Focus Four. Safety checks are manual, and fixes often go untracked. SiteLens closes that loop." |
| 0:20–0:55 | Live simulation → start the crane (suspended-load) scenario → alert appears | "Physics-based scenarios generate real hazard events. This load swings into a worker's zone, and an alert fires, mapped to an official OSHA rule that Nimble checked against the source text." |
| 0:55–1:25 | Connect camera → photo of a person without a hardhat → alert with thumbnail | "A real camera frame goes to Liquid's vision model running locally on this laptop. No cloud model sees the image. The alert keeps a thumbnail, and the reviewer can add who it was." |
| 1:25–1:55 | Confirm one alert; mark another False alarm; show the learned rule | "A human verdict is required. False alarms can teach zone-specific suppression, but only with human sign-off. The system never silences alerts on its own." |
| 1:55–2:25 | Corrective action: owner, due date → complete with verifier | "Acknowledging isn't fixing. A hazard closes only when someone verifies the corrective action was completed." |
| 2:25–2:50 | Fill inspection metadata → download the Word report and open it | "One click produces an inspection record aligned to OSHA and Cal/OSHA fields. The full evidence history comes from RawTree, and nothing is invented." |
| 2:50–3:00 | Back to dashboard | "SiteLens: detect, ground, verify, fix, record." |

## Demo walkthrough (checklist)

1. Open https://sitelens-sim.vercel.app/. Select and start a physical scenario in the embedded lab. Its hazard saves automatically as explicitly simulated evidence.
2. Confirm the alert, acknowledge receipt, then record a corrective action. Show that acknowledgement alone leaves the hazard open. Complete the action with a verifier/time to close it.
3. Use the simulated glare controls to demonstrate human-gated learning, then inspect the bounded state and evidence history.
4. Fill the inspection metadata. Include simulations for this training demonstration and download TXT and Word. Explain that these are inspection/corrective-action records, not official injury logs.
5. Keep the local Liquid runtime and authenticated outbound edge worker running. Open Connect camera and upload a frame; observe local inference, typed Jev triage, and persistent evidence.
6. Reload the hosted page to demonstrate durable state. If the worker is offline, the UI explains why camera inspection is unavailable; simulations/reviews/reports still work.

**Before recording:** confirm the local server, the Liquid runtime (`./scripts/liquid-start.sh`) and the edge worker are running. Recording with simulations only avoids any dependence on the laptop.

See README.md for launch commands and docs/REPORTS.md for report scope.
