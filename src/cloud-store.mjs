import * as blobSDK from '@vercel/blob';
import { setTimeout as delay } from 'node:timers/promises';

/** Private, origin-read JSON snapshot with optimistic concurrency across instances. */
export class CloudStore {
  constructor({ path = 'sitelens/state-v1.json', sdk = blobSDK, token = process.env.BLOB_READ_WRITE_TOKEN } = {}) {
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.split('/').includes('..')) {
      throw new TypeError('CloudStore requires a relative Blob pathname');
    }
    if (!token && !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) {
      throw new Error('CloudStore requires BLOB_READ_WRITE_TOKEN or connected Vercel Blob OIDC credentials');
    }
    if (typeof sdk.get !== 'function' || typeof sdk.put !== 'function') throw new TypeError('CloudStore SDK requires get and put');
    this.path = path;
    this.sdk = sdk;
    // Let the SDK own OIDC refresh. Never capture or pass the OIDC token explicitly.
    this.auth = token ? { token } : {};
  }

  async read() {
    const result = await this.sdk.get(this.path, { access: 'private', useCache: false, headers: { 'Accept-Encoding': 'identity' }, ...this.auth });
    if (result === null) return { value: null, etag: null };
    if (!result.stream || typeof result.blob?.etag !== 'string' || !result.blob.etag) {
      throw new Error('CloudStore received an incomplete Blob response; refusing an unsafe overwrite');
    }
    // Compressed HTTP representations expose weak W/ ETags that cannot satisfy Blob CAS.
    if (result.blob.etag.startsWith('W/')) throw new Error('CloudStore requires an identity response with a strong ETag');
    const value = await new Response(result.stream).json();
    return { value, etag: result.blob.etag };
  }

  /** fn can run repeatedly after conflicts; keep it free of non-idempotent side effects. */
  async update(fn) {
    if (typeof fn !== 'function') throw new TypeError('CloudStore.update requires a mutator function');
    let conflict;
    for (let attempt = 0; attempt < 6; attempt++) {
      const { value, etag } = await this.read();
      const next = await fn(value);
      const body = JSON.stringify(next);
      if (body === undefined) throw new TypeError('CloudStore mutator must return a JSON value');
      try {
        await this.sdk.put(this.path, body, {
          access: 'private', addRandomSuffix: false, cacheControlMaxAge: 60,
          contentType: 'application/json', allowOverwrite: etag !== null,
          ...(etag !== null ? { ifMatch: etag } : {}), ...this.auth,
        });
        // Return precisely what was committed, detached from the mutator's object.
        return JSON.parse(body);
      } catch (error) {
        const precondition = error instanceof blobSDK.BlobPreconditionFailedError ||
          error?.name === 'BlobPreconditionFailedError' || error?.code === 'precondition_failed' ||
          error?.status === 412 || error?.statusCode === 412;
        const firstWriteRace = etag === null && (error?.status === 409 || error?.statusCode === 409 ||
          /\balready[ _]exists\b/i.test(error?.message ?? ''));
        if (!precondition && !firstWriteRace) throw error;
        conflict = error;
        if (attempt < 5) await delay(Math.floor((10 * 2 ** attempt) * (0.5 + Math.random())));
      }
    }
    const error = new Error('CloudStore update conflicted after 6 attempts; retry the request', { cause: conflict });
    error.code = 'CLOUD_STORE_CONFLICT';
    error.statusCode = 409;
    throw error;
  }
}
