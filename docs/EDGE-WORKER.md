# Outbound Liquid edge worker

The hosted application queues a frame in private Vercel Blob. An authenticated worker on the team's Mac polls outward over HTTPS, runs the existing keyless Liquid LFM2.5-VL-450M runtime on loopback, and returns structured observations. The laptop never opens an inbound public port and no replacement cloud model is used. The hosted UI reports `local-required` when the authenticated heartbeat is missing, stale, or the model is unavailable.

## Start

Configure the same randomly generated `EDGE_WORKER_TOKEN` in the Vercel deployment and the local ignored environment file. Configure the worker's `EDGE_CLOUD_URL` to the deployed application origin. Start the existing Liquid runtime, then run:

```sh
node --env-file=.env.edge scripts/edge-worker.mjs
```

The worker accepts HTTPS origins; localhost HTTP is allowed only for development. It refuses redirects on authenticated requests. Do not expose the token in a public environment variable or browser bundle. Stop with Ctrl-C.

## HTTP interface

All worker routes require `Authorization: Bearer <EDGE_WORKER_TOKEN>`, verified with constant-time digest comparison.

- `POST /api/edge/heartbeat`: `{runtime_status: "live" | "loading" | "offline"}`. Timestamps are assigned by the server. A live heartbeat is valid for 45 seconds.
- `GET /api/edge/jobs`: `{job: null}` or `{job: {id, image, claim_token, expires_at}}`. Claims use ETag compare-and-swap, so a job is assigned once.
- `POST /api/edge/jobs/:id`: `{claim_token, detection}` or `{claim_token, error}`. Results must match the claim. Completed-result retries are idempotent. Invalid result types are rejected; empty-frame and vest-only observations remain nonviolations under the hardhat rule.

`handleEdge({path, method, input, authorization})` returns the response body, or null for an unrelated route. Errors include HTTP status hints. `queueDetection(image)` returns a parsed detection and waits up to 45 seconds for a worker. The frame data URL limit is 4,000,000 characters, leaving room below Vercel's total request-body limit. At most eight pending/cleanup jobs are retained; full queues return 429.

## Frame lifetime and environment isolation

Metadata and heartbeat live at the deployment's `STATE_BLOB_PATH` with `-edge-jobs.json` substituted for `.json`. Temporary frames use a sibling `-edge-frames/` prefix. Preview and production must use different state paths when they share a store.

Each frame is private, accessed with an origin read, and never written to the worker's disk. The cloud records a cleanup pointer **before** upload. Success, failure, and timeout delete the frame and remove the job. If deletion fails, the pointer remains marked for cleanup; subsequent worker heartbeats/job requests retry it. An interrupted serverless invocation is also cleaned on the next worker request after expiry. This is request-driven cleanup, not a storage lifecycle guarantee: if all traffic and workers stop, expired frames can remain private until processing resumes. The application must not describe frames as never leaving the phone or as immediately erased under every infrastructure failure.

The worker remains a required running component. Browser camera inspection on the hosted site is unavailable while it is offline. Queued images are not raw history and are not sent to RawTree; only resulting observations become event records through the normal application pipeline.

## Verification

`node --test tests/edge-cloud.test.mjs` exercises bearer authorization, exclusive claiming, full queue/result flow, invalid claims/results, image limits, timeouts, failure cleanup, retrying failed deletes, environment isolation, and the outbound worker HTTP contract with injected dependencies. Real hosted operation additionally requires valid private Blob credentials, a shared worker token, the worker process, and the local Liquid runtime.

The worker also accepts the origin on its command line: `node --env-file=.env.edge scripts/edge-worker.mjs --url https://your-deployment.vercel.app`. The bearer token remains in the environment.
