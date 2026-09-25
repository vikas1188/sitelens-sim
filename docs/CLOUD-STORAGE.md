# Durable serverless state

`src/cloud-store.mjs` stores the application's bounded snapshot in a private Vercel Blob. The default pathname is `sitelens/state-v1.json`. The caller owns the snapshot shape, such as `{state, events, outbox, rules}`, and must enforce its event cap and retention policy. RawTree remains the analytical event history; this blob persists the mutable card and delivery outbox between serverless invocations.

Configure `BLOB_READ_WRITE_TOKEN` on the server, or connect a private Blob store through Vercel OIDC (`BLOB_STORE_ID` and platform-managed `VERCEL_OIDC_TOKEN`). Tokens never go to the browser. Explicit `token` constructor input is useful for local tests. The class fails immediately if neither credential mechanism is configured.

```js
import { CloudStore } from './src/cloud-store.mjs';
const store = new CloudStore();
const { value, etag } = await store.read(); // Both null when the blob does not exist.
const committed = await store.update(previous => ({
  ...(previous ?? {}),
  revision: (previous?.revision ?? 0) + 1,
}));
```

Every read calls `get` with `access: 'private'` and `useCache: false`, which requests the latest origin version. Updates use that response's ETag as `ifMatch`. A first write instead sets `allowOverwrite: false`, so simultaneous creates cannot silently replace each other. Conflicts reload the latest snapshot and rerun the mutator, up to six total attempts with short awaited exponential jitter. Exhaustion throws `CLOUD_STORE_CONFLICT` with HTTP status hint 409. Authentication, malformed JSON, incomplete ETags, and mutator failures propagate immediately; they never become an empty snapshot.

**Mutators can run more than once.** Avoid external calls inside them unless those calls are idempotent. Generate stable event/record IDs before updating, deduplicate IDs inside the mutator, commit pending outbox records atomically with state, then deliver them through a separately idempotent operation. A timed-out storage response can have committed; callers must also tolerate a request-level retry. The store cannot provide an atomic transaction spanning Blob and RawTree.

There is no filesystem persistence, process-local state cache, background interval, or work left running after an update resolves. Retry delays are awaited inside the request. A successful update returns the JSON representation actually submitted, detached from the mutator's object.

## Verification

```sh
node --test tests/cloud-store.test.mjs
RUN_LIVE_BLOB_TESTS=1 node --env-file=.env --test tests/cloud-store.test.mjs
```

Fake SDK tests cover concurrent ETag updates, first-create races, private uncached reads, six-attempt conflict exhaustion, no retry for authentication/mutator errors, malformed/incomplete reads, and missing credentials. The opt-in live test uses a unique `sitelens/smoke/` path, performs concurrent increments, verifies the origin result, and deletes its fixture. It does not alter the real site-state path. Live execution requires a provisioned private Blob store and valid credentials.

API behavior was checked against the installed `@vercel/blob` 2.8.0 types and [Vercel's Blob SDK reference](https://vercel.com/docs/vercel-blob/using-blob-sdk). The one-minute `cacheControlMaxAge` is the provider minimum; correctness depends on uncached reads, not waiting for that cache to expire.

### Compression and ETags

Origin reads explicitly request `Accept-Encoding: identity`. During live testing, compressed 8 KB JSON responses returned a weak `W/` ETag, which repeatedly failed Blob's conditional write despite there being only one writer. Identity reads return the strong storage ETag. Unexpected weak tags are rejected rather than stripped or used for unsafe writes. The live CAS test uses a large compressible fixture to cover this production-sized behavior.
