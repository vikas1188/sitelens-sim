> Historical plan for the initial isolated prototype. The current merged architecture, report workflow and deployment are documented in README.md and DECISIONS.md.

# SiteLens implementation plan

Goal: demonstrate event history separated from a bounded mutable safety state card, human-verdict learning, and verified sponsor integrations in a standalone sibling project.

The supplied brief is the specification. User explicitly requests autonomous execution without approval gates. Architecture: Node HTTP service with append-only durable local outbox replicated to RawTree; SQL read feed; compact deterministic state transitions; bounded Liquid prompts; static dashboard and phone camera client; native iOS LEAP client. Missing Jev credentials must be disclosed, never fabricated.

1. Test core transitions: positive detection, clear detection, confirm/false alarm, bounded context under volume, no suppression before verdict, idempotency, restart persistence.
2. Implement serial event processor and durable journal/outbox; expose events, state, verdict, ack, rules and frame detection APIs. Restrict model endpoint to local runtime.
3. Independently build sponsor adapters, dashboard and Liquid/native client. Test each with current documented APIs.
4. Integrate, exercise live RawTree ingestion/query and Nimble evidence fetch, real Liquid image inference if runtime available.
5. Browser acceptance: simulated event -> alert -> confirm -> second event -> false alarm -> learned rule; replay matching event and show suppression. Verify phone capture, mobile view and failure feedback.
6. Save acceptance recording, smoke tests, run instructions and honest DECISIONS. Start server with port fallback; preserve original repository.

Review focus: concurrent requests, duplicate IDs, repeated verdicts, network outage/restart, bounded state with many open alerts. Human acknowledgement records receipt only; corrective action closure is outside scope. Precision denominator is total emitted alerts; also show reviewed precision separately if available. No fabricated model confidence or timing.
