/**
 * Reads a geocache's details through this site's own API.
 *
 * coord.info cannot be called from the browser — it redirects to geocaching.com,
 * which sends no CORS headers — so /api/cache/:code does the reading on the
 * server. That route also caches at the CDN, which keeps repeat views off
 * geocaching.com entirely.
 *
 * Failures come back as values, never as exceptions: a series shows each cache
 * independently, and one that cannot be read must not become an error page.
 */
import type { CacheDetails, CacheLookupFailure, CacheLookupResult } from '../types/cache';

/** Relative, so the same code works on the deployed site, in the dev server and in a preview. */
const CACHE_ENDPOINT = '/api/cache/';

/**
 * Generous, because a lookup is read from coord.info while the request is being
 * answered and that can take a while on a cold instance, but finite, so a
 * stalled request cannot leave a timeline item spinning for ever. The API's own
 * budget is smaller; this only has to outlast it.
 */
const TIMEOUT_MS = 25000;

const FAILURE_REASONS: CacheLookupFailure[] = ['not-found', 'premium-only', 'network', 'unknown'];

function asReason(value: unknown): CacheLookupFailure | undefined {
  return FAILURE_REASONS.find((reason) => reason === value);
}

/** Guards against anything that is not a cache: a proxy error page, an HTML 404, half a response. */
function asCache(value: unknown): CacheDetails | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const candidate = value as Partial<CacheDetails>;
  if (typeof candidate.code !== 'string' || typeof candidate.name !== 'string') return undefined;

  return candidate as CacheDetails;
}

export async function fetchCacheDetails(rawCode: string): Promise<CacheLookupResult> {
  const code = String(rawCode ?? '').trim().toUpperCase();
  if (code === '') return { ok: false, reason: 'not-found' };

  let response: Response;
  try {
    response = await fetch(CACHE_ENDPOINT + encodeURIComponent(code), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Offline, blocked, or timed out: all the same to the caller, which offers a retry.
    return { ok: false, reason: 'network' };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const cache = asCache((body as { cache?: unknown } | null)?.cache);
  if (response.ok && cache) return { ok: true, cache };

  // The API names its reason in the body; the status is the fallback for when
  // something else answered — a proxy, a static host with no function behind it.
  const reason = asReason((body as { reason?: unknown } | null)?.reason);
  if (reason) return { ok: false, reason };

  if (response.status === 404) return { ok: false, reason: 'not-found' };
  return { ok: false, reason: response.status === 502 || response.status === 503 ? 'network' : 'unknown' };
}
