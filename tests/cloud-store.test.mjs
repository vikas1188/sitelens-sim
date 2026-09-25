import test from 'node:test';
import assert from 'node:assert/strict';
import { BlobPreconditionFailedError, BlobError } from '@vercel/blob';
import { CloudStore } from '../src/cloud-store.mjs';

function fakeSDK(initial = undefined) {
  let value = initial, revision = initial === undefined ? 0 : 1;
  const calls = { get: [], put: [] };
  return {
    calls,
    async get(path, options) {
      calls.get.push({ path, options });
      if (!revision) return null;
      return { stream: new Response(JSON.stringify(value)).body, blob: { etag: `"${revision}"` } };
    },
    async put(path, body, options) {
      calls.put.push({ path, body, options });
      if (revision && !options.allowOverwrite) throw new BlobError('This blob already exists');
      if (options.ifMatch && options.ifMatch !== `"${revision}"`) throw new BlobPreconditionFailedError();
      value = JSON.parse(body); revision++;
      return { etag: `"${revision}"` };
    },
  };
}
const make = sdk => new CloudStore({ sdk, token: 'test-only-token' });

test('missing snapshot is null, first create is private and guarded, reads bypass cache', async () => {
  const sdk = fakeSDK(), store = make(sdk);
  assert.deepEqual(await store.read(), { value: null, etag: null });
  assert.deepEqual(await store.update(() => ({ count: 1 })), { count: 1 });
  assert.deepEqual(await store.read(), { value: { count: 1 }, etag: '"1"' });
  assert.ok(sdk.calls.get.every(c => c.options.useCache === false && c.options.access === 'private' && c.options.headers['Accept-Encoding'] === 'identity'));
  const opts = sdk.calls.put[0].options;
  assert.equal(opts.allowOverwrite, false); assert.equal(opts.addRandomSuffix, false);
  assert.equal(opts.cacheControlMaxAge, 60); assert.equal(opts.access, 'private');
  assert.equal(opts.ifMatch, undefined);
});

test('two simultaneous writers retry stale ETag and preserve both increments', async () => {
  const sdk = fakeSDK({ count: 0 });
  await Promise.all([make(sdk).update(v => ({ count: v.count + 1 })), make(sdk).update(v => ({ count: v.count + 1 }))]);
  assert.equal((await make(sdk).read()).value.count, 2);
  assert.equal(sdk.calls.put.length, 3);
  assert.ok(sdk.calls.put.every(c => c.options.allowOverwrite && c.options.ifMatch));
});

test('simultaneous first creates resolve race without lost increments', async () => {
  const sdk = fakeSDK();
  await Promise.all([make(sdk).update(v => ({ count: (v?.count ?? 0) + 1 })), make(sdk).update(v => ({ count: (v?.count ?? 0) + 1 }))]);
  assert.equal((await make(sdk).read()).value.count, 2);
  assert.equal(sdk.calls.put.filter(c => c.options.allowOverwrite === false).length, 2);
  assert.equal(sdk.calls.put.at(-1).options.ifMatch, '"1"');
});

test('persistent CAS conflicts are bounded at six and surfaced as retryable conflict', async () => {
  const sdk = fakeSDK({ count: 0 }); let writes = 0;
  sdk.put = async () => { writes++; throw new BlobPreconditionFailedError(); };
  await assert.rejects(make(sdk).update(v => ({ count: v.count + 1 })), e => e.code === 'CLOUD_STORE_CONFLICT' && e.statusCode === 409 && e.cause instanceof BlobPreconditionFailedError);
  assert.equal(writes, 6);
});

test('mutator failures and storage authentication failures are not retried', async () => {
  const sdk = fakeSDK({ count: 0 });
  await assert.rejects(make(sdk).update(() => { throw new Error('mutator failed'); }), /mutator failed/);
  assert.equal(sdk.calls.put.length, 0);
  let writes = 0; sdk.put = async () => { writes++; throw new Error('Forbidden'); };
  await assert.rejects(make(sdk).update(() => ({ count: 1 })), /Forbidden/);
  assert.equal(writes, 1);
});

test('corrupt or incomplete blobs cannot be overwritten', async () => {
  for (const result of [{ stream: new Response('{bad json').body, blob: { etag: 'v1' } }, { stream: new Response('{}').body, blob: {} }]) {
    let writes = 0; const sdk = { get: async () => result, put: async () => { writes++; } };
    await assert.rejects(make(sdk).update(() => ({}))); assert.equal(writes, 0);
  }
});

test('mutator return must serialize, async mutators work and commit detached JSON', async () => {
  const sdk = fakeSDK(); await assert.rejects(make(sdk).update(() => undefined), /JSON value/);
  const next = { count: 3 }; const result = await make(sdk).update(async () => next);
  next.count = 9; assert.equal(result.count, 3);
});

test('missing credentials fail before storage access', () => {
  const saved = Object.fromEntries(['BLOB_STORE_ID', 'VERCEL_OIDC_TOKEN'].map(k => [k, process.env[k]]));
  try {
    delete process.env.BLOB_STORE_ID; delete process.env.VERCEL_OIDC_TOKEN;
    assert.throws(() => new CloudStore({ sdk: fakeSDK(), token: '' }), /requires BLOB_READ_WRITE_TOKEN/);
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('LIVE private Blob concurrent CAS roundtrip', { skip: process.env.RUN_LIVE_BLOB_TESTS !== '1' }, async () => {
  const sdk = await import('@vercel/blob');
  const path = `sitelens/smoke/${crypto.randomUUID()}.json`;
  const store = new CloudStore({ path });
  try {
    await Promise.all([store.update(v => ({ count: (v?.count ?? 0) + 1, padding: 'large compressible state '.repeat(1000) })), store.update(v => ({ count: (v?.count ?? 0) + 1, padding: 'large compressible state '.repeat(1000) }))]);
    assert.equal((await store.read()).value.count, 2);
  } finally {
    await sdk.del(path, process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : {});
  }
});


test('identity reads prevent weak compressed ETags from breaking single-writer CAS', async () => {
  const sdk = fakeSDK({ summary: 'long state '.repeat(1000) });
  const get = sdk.get;
  sdk.get = async (path, options) => {
    const result = await get(path, options);
    if (options.headers?.['Accept-Encoding'] !== 'identity') result.blob.etag = 'W/' + result.blob.etag;
    return result;
  };
  const next = await make(sdk).update(v => ({ ...v, revised: true }));
  assert.equal(next.revised, true); assert.equal(sdk.calls.put.length, 1);
});
