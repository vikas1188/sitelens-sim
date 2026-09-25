# Verification — merged production build

Verified on 2026-09-25 against `https://sitelens-sim.vercel.app` and the local merged application.

- Full Node suite: 66 tests, 61 passed, 5 opt-in live tests skipped, zero failures. Separate real sponsor/storage checks were also executed successfully.
- Original physics/browser harness: 76 assertions passed, zero failures.
- All five physical hazard triggers produced evidence with the correct zone and rule mapping.
- Eight OSHA rule mappings verified against real Nimble source retrieval.
- RawTree live test: 205-event complete-history export, pagination, latest corrective actions and record-ID visibility checks passed.
- Private Blob live tests: concurrent updates, first-create races, and a compressible 24 KB state passed. Identity encoding preserves strong ETags for conditional writes.
- Private frame queue through actual local Liquid inference passed; temporary frame deletion verified.
- Production API smoke: typed Jev decision, idempotent submission, confirmation/acknowledgement, verified closure, complete TXT/DOCX attachments, simulation exclusion, hosted camera → local Liquid → Jev → durable evidence, and private-file 404 checks all passed.
- Browser UI: corrections and downloads passed; 390 px, 768 px and 1440 px layouts had no document overflow and no JavaScript page errors. A representative four-page Word report was rendered and every page inspected.
- Staged source was checked against the supplied local credential values; no matching credentials were present.

## Reproduce

```sh
npm test
npm run test:live
RUN_LIVE_BLOB_TESTS=1 node --env-file=.env.vercel --test tests/cloud-store.test.mjs
TEST_CAMERA=1 node scripts/hosted-smoke.mjs
```

The hosted smoke writes explicitly simulated test evidence and one blank-frame observation. It verifies real providers rather than mocking them. Camera checks require the local model and authenticated worker to be running. Private credentials are intentionally absent from GitHub.

## Remaining product limits

This is a shared hackathon demo, without user accounts. The local worker must stay online for hosted image inspection. Native iOS signing/device execution is unverified. Detection accuracy has not been validated on real construction-site footage. Reports support inspection documentation; they are not official OSHA injury/illness forms or a compliance certification.

## Captured-image follow-up

The expanded Node suite has 71 tests: 66 passed, 5 live opt-ins skipped, no failures. Five new tests verify image decoding/resizing/metadata stripping, path rejection, local persistence, private Blob roundtrip, and human-label history/report semantics. Separate live private Blob storage and real Liquid photo detection passed. Browser smoke verified the thumbnail, enlarged image dialog, label save/reload, preservation of unsaved text during polling, and mobile sizing without page errors. Old observations deliberately show no image; no picture or identity is reconstructed.
