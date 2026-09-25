# Local API

All mutation bodies are JSON. Same-origin browser writes only. No public-production authentication is included.

| Endpoint | Behavior |
|---|---|
| GET /health | Service health and state revision |
| GET /api/status | Actual integration status and outbox count |
| GET /api/state | Bounded mutable card |
| GET /events | Latest events (RawTree SQL when synced; explicit local fallback) and all-history SQL metrics |
| POST /events | Validate, run Jev, persist detection/enrichment/state, enqueue RawTree batch, schedule Liquid text rewrite |
| POST /events/:id/verdict | `{ "verdict": "confirmed" }` or `false_alarm`; repeated identical verdict is idempotent; conflicting changes return409 |
| POST /events/:id/ack | `{}`; receipt acknowledgement, idempotent |
| POST /api/detect | `{ "image": "data:image/jpeg;base64,...", "source": "browser-camera", "zone": "ZONE-A" }`; real local Liquid inference, then normal event processing |
| POST /detect/frame | Alias for /api/detect |
| GET /api/rules | Rules and source provenance |
| POST /api/rules/refresh | Fetch current Nimble evidence and persist verified/fallback mapping; may take up to90seconds |
| GET /api/evidence/export | Download events, source/metrics, state and rules |

Event schema:

```json
{
  "event_id": "unique-client-id",
  "ts": "2026-09-25T22:00:00Z",
  "source": "iphone-1",
  "type": "ppe_violation",
  "zone": "ZONE-A",
  "detector_payload": {
    "workers_visible": 1,
    "all_wearing_hardhats": false,
    "all_wearing_hiviz": true,
    "violation": true,
    "description": "Worker without a hardhat in the configured hazard zone."
  }
}
```

`type` also accepts `focus4_scenario`. `confidence` and `pattern` are optional detector payload fields; confidence must be an actual explicit value0..1, not invented for model outputs. Storage fields `kind` and `record_id` are reserved and rejected. Reusing an event ID with identical content is idempotent; different content returns409.

Responses expose the actual decision provider/model, typed answers and latency; alert writer provenance; suppression status; verdict/acknowledgement; and RawTree/local feed source. Event IDs/source names are limited to100 ASCII identifier characters; observations to16KB; frames to roughly5MB JPEG/PNG. Busy vision runtime returns429 and unavailable runtime503. Invalid input400. Unknown event404.

## Merged simulation and report additions

The five configured zones are `ZONE-A` through `ZONE-E`. Simulation source events contain `detector_payload.simulated: true` and the scenario-specific rule ID.

- `POST /events/:id/correction`: `{action,owner,due_date,status,notes,completed_at,verified_by}`. Status is `open`, `in_progress` or `completed`; completion requires the verifier and a valid non-future completion time. Returns `event.corrective_action` and `event.closed`.
- `POST /api/report`: `{format:"txt"|"docx",site:{name,location,inspector,inspection_date,prepared_by,scope},include_simulations:false}`. Returns an attachment generated from complete evidence. Missing metadata stays explicit; failure to read full hosted history fails the report rather than silently returning only the recent cache.
- `/api/edge/heartbeat`, `/api/edge/jobs`, `/api/edge/jobs/:id`: authenticated outbound worker protocol; see worker documentation. Browser code never receives the worker token.

The Vercel handler uses private Blob compare-and-set persistence and a durable RawTree outbox. The local server uses its recoverable JSONL journal. Both share the same state transitions and report generator.

## Alert pictures and human person labels

`POST /api/detect` accepts optional `person_label` (maximum 120 characters). Frames with visible people and unconfirmed hardhat coverage retain a metadata-stripped JPEG and return `event.evidence_image` with URL/dimensions/capture timestamp. `GET /api/evidence-images/:uuid` serves it as JPEG with private/no-store caching. No picture is invented for old or simulated events. `POST /events/:id/person` with `{label}` saves or clears a human-entered person label without changing the hazard decision, original detection, or alert counts; it is appended to the evidence history and included in report records.
