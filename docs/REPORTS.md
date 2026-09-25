# Safety inspection report exports

The report generator produces plain UTF-8 TXT and a genuine Office Open XML `.docx` document. It does not rename HTML to `.doc` and does not claim to generate official OSHA Form 300, 300A or 301.

## Purpose and source basis

Reports organize inspection evidence and corrective-action fields around [Cal/OSHA Title 8 section 3203(b)(1)](https://www.dir.ca.gov/title8/3203.html), which addresses records identifying inspectors, unsafe conditions and work practices, and action taken to correct them. [Section 1509(a)](https://www.dir.ca.gov/title8/1509.html) links construction employers' Injury and Illness Prevention Programs to section 3203. Retention requirements and exceptions must be assessed by the employer. [OSHA hazard identification guidance](https://www.osha.gov/safety-management/hazard-Identification) supports the hazard identification and follow-up structure. [OSHA recordkeeping forms](https://www.osha.gov/recordkeeping/forms) are separate injury and illness records.

This is an inspection support record, not certification of compliance, a regulatory finding, an injury report or a replacement for an effective IIPP. Model detections remain subject to human review and actual site conditions.

## Application contract

```js
import { generateReport } from './src/reports.mjs';
const { txt, docx } = await generateReport({
  events,       // FULL event set, not the dashboard's 200-row feed
  metrics,      // Provenance only; report counts are recomputed for selected events
  source,       // e.g. rawtree or local durable journal
  state,
  rules,        // Rule array or { rules, provenance }
  site: { name, location, inspector, inspection_date, prepared_by, scope },
  include_simulations: true,
  generated_at: new Date().toISOString()
});
```

`buildReportModel`, `renderTxt` and `renderDocx` are also exported. TXT and DOCX share a single report model. Runtime dependency: `docx`.

The endpoint must pass every event in the requested scope. The generator deliberately has no 200-record limit. Missing supplied facts become `Not recorded`; the report generation timestamp is never substituted for the inspection date. Unknown object fields are not dumped into output. Recognized RawTree credentials and Bearer strings in supplied text are redacted.

Each event includes observation description, time, zone, evidence ID, source classification, human verdict, receipt acknowledgement, scoped rule and qualification, recommended control, and provenance. `simulated`, `is_simulation`, detector `simulated`, or explicitly simulated/demo/fixture source names identify simulated evidence. Recorded replay sources are labelled as replay observations. Unknown sources remain unclassified. Simulation filtering affects both records and recomputed summary counts.

## Corrective action fields

Use `event.corrective_action` (or `event.correction`) with:

```js
{ action, owner, due_date, status, completed_at, verified_by }
```

Recommended action never fills the actual action field. Acknowledgement means receipt, not correction or closure. The report indicates correction and verifier information is recorded only when status is `verified`, `closed`, or `completed` and actual action, completion date, and verifier are supplied; it still asks the reader to confirm supporting evidence. Missing fields remain explicitly visible. Neither an incident nor an injury is inferred.

## Verification

Run `node --test tests/reports.test.mjs`. Tests cover 237-record retention, simulation filtering and counts, missing metadata, acknowledgement versus closure, scoped rules, supplied corrections, secret-field exclusion, and actual DOCX ZIP bytes.

For document QA, use the bundled Node runtime and bundled `docx` package, injecting `{ docx }` as the second argument to `generateReport`. Render the sample through the documents skill's `render_docx.py`, using the bundled LibreOffice binary, then inspect every page. QA artifacts belong under ignored `artifacts/report-qa/` and are not site inspection evidence.
