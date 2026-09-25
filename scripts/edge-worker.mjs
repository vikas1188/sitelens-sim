#!/usr/bin/env node
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { detect, liquidStatus } from '../src/vision.mjs';

export async function runWorker({ baseURL = process.env.EDGE_CLOUD_URL || process.env.SITELENS_URL,
  token = process.env.EDGE_WORKER_TOKEN, inspect = detect, runtimeStatus = liquidStatus,
  fetchImpl = fetch, signal, pollMs = 1500, log = console.log } = {}) {
  if (!baseURL || !token) throw new Error('Set EDGE_CLOUD_URL and EDGE_WORKER_TOKEN before starting the worker');
  const url = new URL(baseURL);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('EDGE_CLOUD_URL must use HTTPS (or localhost HTTP for tests)');
  const base = url.origin;
  const request = async (path, body) => {
    const response = await fetchImpl(base + path, {
      method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]),
    });
    if (!response.ok) throw Object.assign(new Error(`Cloud returned HTTP ${response.status}`), { status: response.status });
    return response.json();
  };
  let lastHeartbeat = 0;
  const heartbeat = async () => {
    const status = await runtimeStatus();
    await request('/api/edge/heartbeat', { runtime_status: status.status === 'live' ? 'live' : status.status === 'loading' ? 'loading' : 'offline' });
    lastHeartbeat = Date.now(); return status.status === 'live';
  };
  log(`Starting SiteLens edge worker for ${base}. Frames are processed locally and are not written to disk.`);
  while (!signal?.aborted) {
    try {
      if (Date.now() - lastHeartbeat > 10000 && !(await heartbeat())) { await delay(pollMs, undefined, { signal }); continue; }
      const { job } = await request('/api/edge/jobs');
      if (job) {
        log(`Inspecting frame ${job.id}`);
        let body;
        try { body = { detection: await inspect(job.image), claim_token: job.claim_token }; }
        catch (error) { body = { error: error.message.slice(0, 200), claim_token: job.claim_token }; }
        // The exact same claim/result may be retried after a lost response.
        for (let attempt = 0; attempt < 3; attempt++) {
          try { await request(`/api/edge/jobs/${job.id}`, body); break; }
          catch (error) { if (attempt === 2 || [401, 403, 409, 410].includes(error.status)) throw error; await delay(500, undefined, { signal }); }
        }
        log(body.detection ? `Inspection completed: ${job.id}` : `Inspection failed: ${job.id}`);
      }
    } catch (error) {
      if (signal?.aborted) break;
      log(`Worker retry: ${error.message}`);
      if ([401, 403].includes(error.status)) throw new Error('Worker authorization rejected; check EDGE_WORKER_TOKEN');
    }
    try { await delay(pollMs, undefined, { signal }); } catch { break; }
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort()); process.once('SIGTERM', () => controller.abort());
  const urlFlag = process.argv.indexOf('--url');
  const baseURL = urlFlag >= 0 ? process.argv[urlFlag + 1] : undefined;
  if (urlFlag >= 0 && (!baseURL || baseURL.startsWith('--'))) throw new Error('--url requires the hosted application URL');
  runWorker({ signal: controller.signal, ...(baseURL ? { baseURL } : {}) }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
