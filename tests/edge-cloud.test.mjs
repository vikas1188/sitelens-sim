import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createEdgeCloud, validateEdgeImage } from '../src/edge-cloud.mjs';
import { runWorker } from '../scripts/edge-worker.mjs';

const IMAGE = 'data:image/png;base64,iVBORw0KGgo=';
const TOKEN = 'test-worker-token';
function fixture(options = {}) {
  let value = null, chain = Promise.resolve();
  const files = new Map(), writes = [], deletes = [];
  const store = {
    async read() { return { value: structuredClone(value), etag: 'fake' }; },
    update(fn) {
      const task = chain.then(async () => { value = await fn(structuredClone(value)); return structuredClone(value); });
      chain = task.catch(() => {}); return task;
    },
  };
  const sdk = {
    async put(path, body, opts) { writes.push({ path, opts }); files.set(path, body); },
    async get(path, opts) { assert.equal(opts.access, 'private'); assert.equal(opts.useCache, false); return files.has(path) ? { stream: new Response(files.get(path)).body } : null; },
    async del(path) { deletes.push(path); files.delete(path); },
  };
  const edge = createEdgeCloud({ store, sdk, token: TOKEN, blobToken: 'test-only', timeoutMs: 1000, pollMs: 5, ...options });
  const call = (path, method = 'GET', input = {}, authorization = `Bearer ${TOKEN}`) => edge.handleEdge({ path, method, input, authorization });
  const live = () => call('/api/edge/heartbeat', 'POST', { runtime_status: 'live' });
  return { edge, call, live, store, sdk, files, writes, deletes };
}
async function claim(f) {
  for (let i = 0; i < 50; i++) { const { job } = await f.call('/api/edge/jobs'); if (job) return job; await delay(2); }
  throw new Error('No job arrived');
}
const detection = { workers_visible: 1, all_wearing_hardhats: false, all_wearing_hiviz: false, violation: true, description: 'Missing hardhat', inference_ms: 15 };

test('worker routes require configured constant-time bearer authorization', async () => {
  const f = fixture();
  for (const value of ['', 'Bearer wrong', 'Basic abc']) await assert.rejects(f.call('/api/edge/jobs', 'GET', {}, value), e => e.statusCode === 401);
  assert.equal(await f.call('/unrelated'), null);
  await assert.rejects(f.call('/api/edge/jobs', 'DELETE'), e => e.statusCode === 405);
  assert.equal((await fixture({ token: '' }).edge.edgeStatus()).status, 'local-required');
});

test('queue -> exclusive claim -> validated result -> private image cleanup', async () => {
  const f = fixture(); await f.live();
  const pending = f.edge.queueDetection(IMAGE);
  const job = await claim(f);
  assert.equal(job.image, IMAGE);
  assert.deepEqual(await f.call('/api/edge/jobs'), { job: null });
  await f.call(`/api/edge/jobs/${job.id}`, 'POST', { detection, claim_token: job.claim_token });
  const result = await pending;
  assert.equal(result.violation, true); assert.equal(result.runtime, 'local-edge-worker');
  assert.equal(result.model_description, 'Missing hardhat');
  assert.equal(f.files.size, 0); assert.equal((await f.store.read()).value.jobs.length, 0);
  assert.ok(f.writes.every(w => w.opts.access === 'private' && w.opts.allowOverwrite === false));
});

test('wrong claims and malformed worker detections cannot commit', async () => {
  const f = fixture(); await f.live(); const pending = f.edge.queueDetection(IMAGE); const job = await claim(f);
  await assert.rejects(f.call(`/api/edge/jobs/${job.id}`, 'POST', { detection, claim_token: 'wrong' }), e => e.statusCode === 409);
  await assert.rejects(f.call(`/api/edge/jobs/${job.id}`, 'POST', { detection: { ...detection, violation: 'true' }, claim_token: job.claim_token }), e => e.statusCode === 400);
  await f.call(`/api/edge/jobs/${job.id}`, 'POST', { detection: { ...detection, workers_visible: 0 }, claim_token: job.claim_token });
  const result = await pending; assert.equal(result.violation, false); assert.equal(result.model_reported_violation, true);
});

test('offline workers and oversized images fail before private upload', async () => {
  const f = fixture(); await assert.rejects(f.edge.queueDetection(IMAGE), e => e.statusCode === 503);
  assert.throws(() => validateEdgeImage('data:image/png;base64,' + 'A'.repeat(4_000_000)), e => e.statusCode === 413);
  assert.equal(f.files.size, 0);
});

test('timeout and worker failure both delete temporary frame', async () => {
  const timed = fixture({ timeoutMs: 20 }); await timed.live();
  await assert.rejects(timed.edge.queueDetection(IMAGE), e => e.statusCode === 504);
  assert.equal(timed.files.size, 0);
  const f = fixture(); await f.live(); const pending = f.edge.queueDetection(IMAGE); const job = await claim(f);
  await f.call(`/api/edge/jobs/${job.id}`, 'POST', { error: 'Local model offline', claim_token: job.claim_token });
  await assert.rejects(pending, e => e.statusCode === 502); assert.equal(f.files.size, 0);
});

test('failed delete retains cleanup pointer and next heartbeat retries', async () => {
  const f = fixture({ timeoutMs: 20 }); await f.live(); const original = f.sdk.del;
  f.sdk.del = async () => { throw new Error('temporary storage failure'); };
  await assert.rejects(f.edge.queueDetection(IMAGE), e => e.statusCode === 504);
  assert.equal(f.files.size, 1); assert.equal((await f.edge.edgeStatus()).cleanup_pending, 1);
  f.sdk.del = original; await f.live(); assert.equal(f.files.size, 0); assert.equal((await f.store.read()).value.jobs.length, 0);
});

test('outbound worker uses bearer auth, performs local inspect, submits result', async () => {
  const controller = new AbortController(), requests = [];
  await runWorker({ baseURL: 'https://example.test', token: TOKEN, signal: controller.signal, pollMs: 1,
    runtimeStatus: async () => ({ status: 'live' }), inspect: async image => { assert.equal(image, IMAGE); return detection; }, log: () => {},
    fetchImpl: async (url, options) => {
      requests.push({ url, options }); assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`); assert.equal(options.redirect, 'error');
      if (url.endsWith('/heartbeat')) return Response.json({ ok: true });
      if (url.endsWith('/jobs')) return Response.json({ job: { id: 'test-id', image: IMAGE, claim_token: 'claim' } });
      assert.equal(JSON.parse(options.body).detection.violation, true); controller.abort(); return Response.json({ ok: true });
    },
  });
  assert.equal(requests.length, 3);
  await assert.rejects(runWorker({ baseURL: 'http://remote.example', token: TOKEN }), /HTTPS/);
  await assert.rejects(runWorker({ baseURL: 'https://example.test', token: '' }), /Set EDGE_CLOUD_URL/);
});

test('preview and production edge metadata use separate state-derived paths', async () => {
  const paths = [];
  const sdk = { get: async path => { paths.push(path); return null; }, put: async () => {} };
  for (const statePath of ['sitelens/preview-state-v1.json', 'sitelens/production-state-v1.json']) {
    const edge = createEdgeCloud({ sdk, blobToken: 'test-only', token: TOKEN, statePath });
    await edge.edgeStatus();
  }
  assert.deepEqual(paths, ['sitelens/preview-state-v1-edge-jobs.json', 'sitelens/production-state-v1-edge-jobs.json']);
});
