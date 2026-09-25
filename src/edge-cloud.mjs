import * as blobSDK from '@vercel/blob';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { CloudStore } from './cloud-store.mjs';
import { validateImage, parseDetection } from './vision.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status, statusCode: status });
function authenticate(authorization, token) {
  if (!token) throw fail(503, 'Edge worker is not configured');
  const candidate = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const digest = value => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(candidate), digest(token))) throw fail(401, 'Invalid edge worker authorization');
}
export function validateEdgeImage(image) {
  if (typeof image === 'string' && image.length > 4_000_000) throw fail(413, 'Image too large for hosted inspection; resize to 1280 pixels or smaller');
  return validateImage(image);
}
function normalizeResult(value) {
  if (!value || typeof value !== 'object' || value.workers_visible > 1000 || typeof value.description !== 'string' || value.description.length > 4000) {
    throw fail(400, 'Invalid edge detection result');
  }
  let detection;
  try { detection = parseDetection(JSON.stringify({ ...value, description: typeof value.model_description === 'string' ? value.model_description.slice(0, 1000) : value.description, violation: value.model_reported_violation ?? value.violation })); }
  catch { throw fail(400, 'Invalid edge detection result'); }
  return { ...detection, runtime: 'local-edge-worker', inference_ms: Number.isFinite(value.inference_ms) ? Math.max(0, Math.min(120_000, Math.round(value.inference_ms))) : null };
}

/** Dependencies are injectable so the cloud protocol can be tested without a network. */
export function createEdgeCloud({ sdk = blobSDK, store, token = process.env.EDGE_WORKER_TOKEN,
  blobToken = process.env.BLOB_READ_WRITE_TOKEN, now = Date.now, sleep = delay,
  timeoutMs = 45_000, pollMs = 850, maxJobs = 8,
  statePath = process.env.STATE_BLOB_PATH || 'sitelens/state-v1.json' } = {}) {
  const namespace = statePath.replace(/\.json$/, '');
  const state = store ?? new CloudStore({ path: `${namespace}-edge-jobs.json`, sdk, token: blobToken });
  const auth = blobToken ? { token: blobToken } : {};
  const empty = value => ({ jobs: [], heartbeat: null, ...value });

  async function sweep() {
    const current = empty((await state.read()).value);
    const removed = [];
    for (const job of current.jobs.filter(j => j.expires_at <= now())) {
      try { await sdk.del(job.image_path, auth); removed.push(job.id); }
      catch { /* Keep metadata so the next request or heartbeat retries deletion. */ }
    }
    if (removed.length) await state.update(value => {
      const data = empty(value);
      return { ...data, jobs: data.jobs.filter(j => !(removed.includes(j.id) && j.expires_at <= now())) };
    });
  }

  async function cleanup(id, imagePath) {
    try {
      await sdk.del(imagePath, auth);
      await state.update(value => ({ ...empty(value), jobs: empty(value).jobs.filter(j => j.id !== id) }));
    } catch {
      // Do not drop the only pointer to a frame whose delete failed.
      await state.update(value => ({ ...empty(value), jobs: empty(value).jobs.map(j => j.id === id ? { ...j, expires_at: now(), status: 'cleanup_pending', result: null } : j) }));
    }
  }

  async function edgeStatus() {
    if (!token) return { status: 'local-required', detail: 'Authenticated local Liquid edge worker is not configured' };
    const data = empty((await state.read()).value), heartbeat = data.heartbeat;
    const fresh = heartbeat && now() - heartbeat.ts < 45_000;
    const live = fresh && heartbeat.runtime_status === 'live';
    return {
      status: live ? 'live' : 'local-required',
      detail: live ? 'Liquid LFM2.5-VL-450M · authenticated local edge worker · keyless inference' : 'Start the local Liquid runtime and outbound edge worker',
      last_seen: heartbeat ? new Date(heartbeat.ts).toISOString() : null,
      queued: data.jobs.filter(j => j.expires_at > now() && ['queued', 'processing'].includes(j.status)).length,
      cleanup_pending: data.jobs.filter(j => j.expires_at <= now()).length,
    };
  }

  async function handleEdge({ path, method, input = {}, authorization } = {}) {
    const jobMatch = /^\/api\/edge\/jobs\/([a-f0-9-]{36})$/.exec(path ?? '');
    if (path !== '/api/edge/heartbeat' && path !== '/api/edge/jobs' && !jobMatch) return null;
    authenticate(authorization, token);
    if (path === '/api/edge/heartbeat' && method === 'POST') {
      if (!['live', 'loading', 'offline'].includes(input.runtime_status)) throw fail(400, 'Invalid runtime heartbeat');
      await sweep();
      await state.update(value => ({ ...empty(value), heartbeat: { ts: now(), runtime_status: input.runtime_status, model: 'LFM2.5-VL-450M' } }));
      return { ok: true };
    }
    if (path === '/api/edge/jobs' && method === 'GET') {
      await sweep();
      if (!empty((await state.read()).value).jobs.some(j => j.status === 'queued' && j.expires_at > now())) return { job: null };
      const claimToken = randomUUID();
      const data = await state.update(value => {
        const current = empty(value), selected = current.jobs.find(j => j.status === 'queued' && j.expires_at > now());
        if (!selected) return current;
        return { ...current, jobs: current.jobs.map(j => j.id === selected.id ? { ...j, status: 'processing', claim_token: claimToken } : j) };
      });
      const job = data.jobs.find(j => j.claim_token === claimToken);
      if (!job) return { job: null };
      const image = await sdk.get(job.image_path, { access: 'private', useCache: false, ...auth });
      if (!image?.stream) throw fail(410, 'Frame expired before the worker could load it');
      return { job: { id: job.id, claim_token: claimToken, image: await new Response(image.stream).text(), expires_at: job.expires_at } };
    }
    if (jobMatch && method === 'POST') {
      if (typeof input.claim_token !== 'string') throw fail(400, 'Missing job claim token');
      if (!!input.error === !!input.detection) throw fail(400, 'Send either a detection or an error');
      const result = input.detection ? normalizeResult(input.detection) : null;
      await state.update(value => {
        const current = empty(value), job = current.jobs.find(j => j.id === jobMatch[1]);
        if (!job || job.expires_at <= now()) throw fail(410, 'Inspection job expired');
        if (job.claim_token !== input.claim_token) throw fail(409, 'Inspection claim does not match');
        if (job.status === 'done' || job.status === 'failed') return current;
        return { ...current, jobs: current.jobs.map(j => j.id === job.id ? { ...j, status: result ? 'done' : 'failed', result, error: input.error ? String(input.error).slice(0, 200) : null } : j) };
      });
      return { ok: true };
    }
    throw fail(405, 'Method not allowed');
  }

  async function queueDetection(image) {
    validateEdgeImage(image);
    if ((await edgeStatus()).status !== 'live') throw fail(503, 'Local Liquid edge worker is offline; start it before inspecting frames');
    await sweep();
    const id = randomUUID(), imagePath = `${namespace}-edge-frames/${id}.txt`, deadline = now() + timeoutMs;
    // Register cleanup metadata before uploading a frame, including for interrupted requests.
    await state.update(value => {
      const data = empty(value);
      if (data.jobs.length >= maxJobs) throw fail(429, 'Edge inspection queue is full; retry shortly');
      return { ...data, jobs: [...data.jobs, { id, image_path: imagePath, status: 'uploading', expires_at: deadline }] };
    });
    try {
      await sdk.put(imagePath, image, { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'text/plain', cacheControlMaxAge: 60, ...auth });
      await state.update(value => ({ ...empty(value), jobs: empty(value).jobs.map(j => j.id === id ? { ...j, status: 'queued' } : j) }));
      while (now() < deadline) {
        const data = empty((await state.read()).value), job = data.jobs.find(j => j.id === id);
        if (!job) throw fail(410, 'Inspection job expired');
        if (job.status === 'done') return job.result;
        if (job.status === 'failed') throw fail(502, job.error || 'Local Liquid inspection failed');
        await sleep(Math.min(pollMs, Math.max(0, deadline - now())));
      }
      throw fail(504, 'Local Liquid inspection timed out; retry after checking the worker');
    } finally { await cleanup(id, imagePath); }
  }
  return { handleEdge, edgeStatus, queueDetection };
}
let instance;
const service = () => instance ??= createEdgeCloud();
export const handleEdge = request => service().handleEdge(request);
export const edgeStatus = () => service().edgeStatus();
export const queueDetection = image => service().queueDetection(image);
