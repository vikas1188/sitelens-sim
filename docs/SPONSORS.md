# Real sponsor integrations

## RawTree

The backend sends authenticated REST requests to `https://api.rawtree.com`. The isolated `sitelens_hackathon` database/table is separate from all other hackathon work. `RAWTREE_DATABASE`, `RAWTREE_TABLE`, and `RAWTREE_ENDPOINT` may override these defaults. The API key is read only from the environment and never returned by the status endpoint.

- `POST /v1/databases` creates this project's database if missing.
- `POST /v1/tables/{table}` appends raw JSON envelopes for detections, enrichments, verdicts, acknowledgements, corrective actions, and compact state snapshots.
- `POST /v1/query` powers the feed and metrics. SQL groups by event ID and selects the latest detection, enrichment, verdict, acknowledgement, and corrective action. Retries keep deterministic record IDs; duplicate physical rows do not duplicate alerts.
- Feed returns the 200 newest enriched detections, including clear and suppressed evidence. Metrics query the whole event set, not only those 200 displayed records.
- `precision = confirmed / all unsuppressed violation alerts`, including unreviewed alerts in the denominator, as required by the demo brief. This is a confirmation rate, not an estimate of classifier precision on a fully labelled sample. `reviewed_precision` is also returned as confirmed divided by confirmed plus false alarms. Zero denominators return null.
- Requests time out after 15 seconds and failed writes throw so the backend's durable outbox can retry.

Documentation: [RawTree API](https://rawtree.com/docs/reference/api), [SQL query guide](https://rawtree.com/docs/guides/query-data).

## Nimble

`node --env-file=.env scripts/setup-sponsors.mjs` runs real Nimble v2 search for OSHA Focus Four material, then verifies eight scoped rules against their official OSHA standard pages. `src/rules.mjs` verifies that each fetched source contains its expected citation and rule evidence, stores a SHA-256 content fingerprint and Nimble request ID, and writes `data/rules.json` atomically.

The structured rules use a deterministic, reviewed mapping of source text. They are **not** generated legal interpretations. Rules with failed retrieval are explicitly marked `curated_fallback` and unverified. Source URLs, scope qualifications, retrieval timestamp, discovery results, and retrieval method remain visible in the JSON.

The PPE rule is head protection in areas with possible head-injury exposure, not a universal hard-hat claim. High-visibility clothing alone is not treated as an OSHA violation. Focus Four examples cover crane load exposure, unprotected edges, excavation cave-ins, and electrical contact; each retains relevant conditions and exceptions. A camera cannot establish every fact needed for a legal violation; alerts require human review.

Documentation: [Nimble v2 introduction](https://docs.nimbleway.com/api-reference/introduction), [Search](https://docs.nimbleway.com/api-reference/search/search), [Extract](https://docs.nimbleway.com/api-reference/extract/extract).

## Validation

Run local contract tests:

```sh
node --env-file=.env --test tests/sponsors.test.mjs
```

Run the opt-in real RawTree integration test:

```sh
RUN_LIVE_SPONSOR_TESTS=1 node --env-file=.env --test tests/sponsors.test.mjs
```

The live test creates a timestamp-named temporary table in the project's database, sends nine small envelopes, verifies duplicate replay, confirmed verdict, acknowledgement, clear-event exclusion, suppressed-event exclusion, and SQL-derived metrics, then deletes only that temporary test table. It does not touch the demo table or any other database.

RawTree writes have a short visibility delay: a successful insert acknowledgement can precede visibility in the next SQL query. The dashboard polls; the live integration test waits a bounded interval before asserting full visibility. Metrics and feed are separate queries and may momentarily reflect adjacent snapshots during ingestion.

## Jev decision layer (not a hackathon sponsor)

`src/jev.mjs` uses the official TypeSafe endpoint `POST https://api.typesafe.ai/v1/systemone` with `jev-latest`, authenticated using `TYPESAFE_JEV_KEY` (or `TYPESAFE_API_KEY`). Each request contains only the current compact state card, current detection, and a computed suppression-eligibility flag. No event history is supplied to the model.

The request asks four typed questions: Noul potential violation, Score severity, Choice over the actual loaded OSHA rule IDs, and Noul suppression. The zero-indexed five-level Score is rounded and converted to UI severity 1–5. Malformed or out-of-range answers throw; an eight-second timeout allows the backend to select its labelled fallback. Suppression is allowed only when the current detector has a known confidence below the threshold and a matching rule has a human-verdict provenance ID. The backend also enforces these conditions independently.

Noul returns a yes probability, **not a confidence field**. `probability` preserves the yes probability; `confidence` is null unless the service explicitly supplies that separate field. The probability must not be substituted for detector confidence in the suppression gate. Actual answer objects, resolved model version, usage, and latency are retained for audit.

Official reference: [TypeSafe API](https://docs.typesafe.ai/api).

```sh
node --env-file=.env --test tests/jev.test.mjs
RUN_LIVE_JEV_TESTS=1 node --env-file=.env --test tests/jev.test.mjs
```

Verified live on September 25, 2026: `jev-1.13.0` returned the four valid typed answers in approximately 357 ms for a PPE test event. This is one measured request, not a latency guarantee.

### Batched outbox uploads

`RawTree.appendBatch(records)` sends a validated JSON array in one `POST /v1/tables/{table}` request, as supported by the official RawTree API. The backend may upload all envelopes for a committed transaction at once and checkpoint only after success. Retry the same deterministic record IDs on failure. An empty batch performs no network request. Live verification uploaded nine mixed envelopes in one request in 478 ms, then verified SQL feed, verdict, acknowledgement, deduplication, and metrics in a temporary test table.

RawTree infers timestamps and serializes DateTime64 values without a timezone. The adapter converts event timestamps and acknowledgement timestamps to explicit UTC ISO strings with millisecond precision, so browsers show the correct local time. Detection `source` is preserved; metric `source` remains `rawtree_sql`.
