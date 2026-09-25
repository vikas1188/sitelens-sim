# SiteLens — simulation, observations, and corrective actions

[Live application](https://sitelens-sim.vercel.app/) · [GitHub](https://github.com/vikas1188/sitelens-sim)

One dashboard combines five physical construction-safety simulations, Liquid image observations, human review, corrective-action tracking, and downloadable inspection reports. Simulation events are explicitly labelled and excluded from inspection reports by default.

## Run locally

Requires Node 22 or 24. On a new checkout:

```bash
npm ci
cp .env.example .env
# Fill the sponsor keys in .env.
npm start
```

Open the printed URL (default `http://localhost:4317`). The server tries the next 20 ports if occupied. No keys are sent to the browser. Local evidence is saved in `data/runtime/`; don't run two local writers against the same directory.

For real image inference on this Apple Silicon Mac:

```bash
./scripts/liquid-start.sh
```

The launcher installs the official Liquid LFM2.5-VL-450M quantized model and llama.cpp, reuses a healthy local runtime, and supports port fallback. Webcam and photo upload are at `/phone.html`. Local inference is a potential-hazard review aid, not a verified legal finding.

## Demonstrate

1. In **Live simulation**, select any of the five scenarios and start it. A physical hazard trigger submits one labelled event into the same dashboard. Open the simulation full-screen for training; its controls, orbit view, and causal explanations remain available.
2. Review the alert: **Confirm**, **False alarm**, or **Acknowledge**. Acknowledgement means receipt, not corrective closure. A false-alarm verdict can teach a zone-specific suppression pattern; unknown-confidence observations are never automatically suppressed.
3. Record a corrective action, responsible person and due date. To complete it, supply the actual completion time and verifier. The hazard closes only after verified completion or a false-alarm verdict.
4. Fill the inspection metadata and download **TXT** or **Word (.docx)**. Select “include simulations” only for a training/demo report. Reports include the complete evidence history, not just the latest dashboard page.
5. Use **Connect camera** to inspect a real frame through Liquid and the same review workflow.

The five scenarios cover a suspended-load exposure, reversing vehicle, unprotected edge, load pinch zone, and conductive ladder near an electrical source. Eight rule mappings retain their official OSHA URLs, applicability limits, and Nimble retrieval provenance. [Simulation details](docs/SIMULATION.md).

## Reports

TXT and genuine DOCX reports align their inspection and corrective-action fields with OSHA hazard-identification guidance and California Title 8 sections 3203 and 1509. They record supplied inspection metadata, observations, source/citation, human verdicts, owners, actions, deadlines and verified completion. Missing information is explicitly marked; no employee, injury or completion facts are invented.

These are inspection/corrective-action records, **not OSHA 300/301 injury forms or a compliance certification**. The preparer must verify the facts and applicability before treating a report as a workplace record. [Report scope and sources](docs/REPORTS.md).

## Hosted architecture

- **Vercel:** static UI plus Node API; no writable local-filesystem dependency.
- **Private Vercel Blob:** compact operational state, recent 200 events and durable outbox. ETag conditional writes retry conflicts across concurrent functions.
- **RawTree:** complete append-only evidence with SQL deduplication and latest review/correction joins. Reports refuse truncated query results.
- **Jev:** typed triage using the current event and bounded state. If unavailable, the event records its deterministic fallback provider.
- **Nimble:** official OSHA source retrieval and verification. Eight verified mappings ship with the app; manual refresh is supported.
- **Liquid:** real local inference, connected to the hosted app through an authenticated outbound worker. Vercel does not run the laptop model.

For the hosted camera, keep both the local Liquid runtime and worker running:

```bash
node --env-file=.env scripts/edge-worker.mjs --url https://sitelens-sim.vercel.app
```

`EDGE_WORKER_TOKEN` must match the deployed server environment. Images are held temporarily in private Blob storage, claimed by the worker, and deleted on completion/expiry. If the laptop or worker is offline, simulation, review and reports continue; image inspection shows that the local worker is required. [Worker details](docs/EDGE-WORKER.md) · [Persistence](docs/CLOUD-STORAGE.md).

The hackathon demo is a shared workspace with no user accounts; do not put confidential workplace/personnel information into this public demo. Keys remain server-side and are not committed.

## Verification and deployment

```bash
npm test
npm run test:live
RUN_LIVE_BLOB_TESTS=1 node --env-file=.env.vercel --test tests/cloud-store.test.mjs
node scripts/build-check.mjs
vercel --prod --yes
```

Open `/simulation/tests.html` to run the 76-assertion physical simulation browser harness. Its integration is disabled, so tests do not create observation records. `tests/` covers state invariants, persistence/replay, multi-zone corrections, typed model contracts, report scope/format, complete-history exports, and cloud storage concurrency. Live tests use isolated fixtures/tables.

Vercel environment names: `RAWTREE_API_KEY`, `NIMBLE_API_KEY`, `TYPESAFE_JEV_KEY`, `EDGE_WORKER_TOKEN`, `RAWTREE_TABLE`, `STATE_BLOB_PATH`; private Blob credentials are provisioned by its project connection. Production and preview use separate state/table names. `vercel.json` exposes only `public/` and API functions.

Native iOS LEAP source is also included under `ios/`; see [Liquid/iOS notes](docs/LIQUID.md). Full Xcode linking, signing and physical-device execution have not been verified on this Mac. The browser/local-model and hosted-worker paths are the runnable demo.
