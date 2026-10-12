/**
 * Request handling for the Vercel function.
 *
 * Kept separate from api/ so it can be called directly in tests with an ordinary
 * Request and Response, and so the one function file stays a thin entry point.
 *
 * Two things live here:
 *
 *   GET /api/card/:slug/:number   the chapter's card, as image/png or image/svg+xml
 *   GET /api/cache/:code          a geocache read from coord.info, as JSON
 *
 * Both are cacheable GETs with no cookies, no auth and no client JavaScript, so
 * they can be hotlinked from anywhere and served straight from the CDN.
 *
 * Cache details are read from coord.info while the request is being answered —
 * nothing about a geocache is stored at build time — so a cache that is added,
 * edited or archived upstream shows up without the site being rebuilt.
 */
import { getChapter } from '../data/chapters.ts';
import type { CacheDetails, CacheLookupFailure } from '../types/cache.ts';
import { canRenderText, renderCardPng } from './card.ts';
import { fetchCacheDetails, type CoordInfoResult } from './coordInfo.ts';
import { createLookupCache } from './lookupCache.ts';
import { buildSeriesCard } from './seriesCard.ts';

/**
 * How long a lookup may take before a card is drawn without details, or the API
 * reports that the cache could not be read.
 *
 * Reading coord.info through Node is much slower than fetching it by hand —
 * around four seconds warm and eleven seconds observed while a cold instance was
 * busy — because geocaching.com is slow to answer and undici re-negotiates more
 * than curl needs to. The budget is deliberately generous: an item left showing
 * "could not be read" is worse than one that appears late, and both routes are
 * cached for an hour afterwards, so almost nobody waits on the slow path twice.
 * It stays under the browser's own timeout so a failure arrives as an answer
 * rather than as a request that never finishes.
 */
const LIVE_LOOKUP_TIMEOUT_MS = 20000;

export interface HandlerDeps {
  fetchImpl?: typeof fetch;
  renderPng?: (svg: string) => Uint8Array<ArrayBuffer>;
  canRenderText?: () => boolean;
}

type CardFormat = 'png' | 'svg';

/**
 * A card is composed from cache details read live, so its bytes can change when
 * geocaching.com does: it is cacheable, never immutable. An hour at the edge is
 * long enough to keep upstream quiet, and the CDN may serve stale while it
 * refreshes so no visitor waits on the refresh.
 */
const CARD_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
/**
 * For a card drawn while its cache could not be read. Kept short so the missing
 * details are filled in soon rather than for the rest of the hour.
 */
const DEGRADED_CARD_CACHE_CONTROL = 'public, max-age=60, s-maxage=300';

/**
 * An hour at the edge, like a card, because the whole point of reading upstream
 * is that an edited cache shows up: the CDN then serves the stale answer while
 * it refreshes, so an edit costs a visitor nothing.
 */
const CACHE_JSON_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
/** Negative answers are cached briefly so a missing code cannot hammer geocaching.com. */
const NEGATIVE_CACHE_CONTROL = 'public, max-age=60, s-maxage=300';
/** Upstream trouble is not cached for long, but briefly enough to be kind. */
const UPSTREAM_FAILURE_CACHE_CONTROL = 'public, max-age=30, s-maxage=60';

function withHeaders(body: BodyInit | null, init: ResponseInit): Response {
  return new Response(body, init);
}

function jsonResponse(body: unknown, status: number, cacheControl: string): Response {
  return withHeaders(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
    },
  });
}

function notFound(message: string): Response {
  return jsonResponse({ error: message }, 404, NEGATIVE_CACHE_CONTROL);
}

/** Only reads; reject anything else rather than guessing. */
function methodNotAllowed(): Response {
  return withHeaders(JSON.stringify({ error: 'Use GET or HEAD' }), {
    status: 405,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      allow: 'GET, HEAD',
      'cache-control': 'no-store',
    },
  });
}

/**
 * The lookup every request in this instance shares, so a code read for a card is
 * not read again for the API and a burst of requests for one code costs one
 * upstream read. See lookupCache.ts.
 */
const sharedLookup = createLookupCache((code: string) =>
  fetchCacheDetails(code, { timeoutMs: LIVE_LOOKUP_TIMEOUT_MS }),
);

/**
 * Tests inject transport and must see every request they cause, so a stub turns
 * the shared memo off rather than being layered behind it.
 */
function lookupFor(deps: HandlerDeps): (code: string) => Promise<CoordInfoResult> {
  const { fetchImpl } = deps;
  if (!fetchImpl) return sharedLookup;

  return (code) => fetchCacheDetails(code, { fetchImpl, timeoutMs: LIVE_LOOKUP_TIMEOUT_MS });
}

/** The cache a card is drawn for, or undefined when coord.info could not say. */
async function resolveCache(code: string, deps: HandlerDeps): Promise<Partial<CacheDetails> | undefined> {
  try {
    const result = await lookupFor(deps)(code);
    return result.ok ? result.cache : undefined;
  } catch {
    // A card is still worth drawing without the cache's own details.
    return undefined;
  }
}

/** Splits a request path into its parts, ignoring the empty segments of slashes. */
function pathSegments(pathname: string): string[] {
  return pathname.split('/').filter((segment) => segment !== '');
}

function parseFormat(raw: string | null, suffix?: string): CardFormat {
  if (raw === 'svg' || raw === 'png') return raw;
  return suffix === 'svg' ? 'svg' : 'png';
}

/**
 * Recognises every shape a card request arrives in.
 *
 * In production Vercel's rewrites turn the public embed URL into this function's
 * own path with the segments carried as query parameters. The dev server and the
 * tests call the function directly with the real path, so those shapes are
 * understood too:
 *
 *   /api/serve?slug=chapter&number=5&format=png  (rewritten from the URL below)
 *   /series/chapter/5/image.png
 *   /api/card/chapter/5?format=png
 */
function resolveCardRoute(
  segments: string[],
  searchParams: URLSearchParams,
): { slug: string; number: string; format: CardFormat } | undefined {
  const slug = searchParams.get('slug');
  const number = searchParams.get('number');

  if (segments[0] === 'api' && segments[1] === 'serve' && slug && number) {
    return { slug, number, format: parseFormat(searchParams.get('format')) };
  }

  if (segments[0] === 'api' && segments[1] === 'card' && segments.length >= 4) {
    return {
      slug: segments[2],
      number: segments[3],
      format: parseFormat(searchParams.get('format')),
    };
  }

  if (segments[0] === 'series' && segments.length === 4) {
    const match = /^image\.(png|svg)$/.exec(segments[3]);
    if (!match) return undefined;

    return { slug: segments[1], number: segments[2], format: parseFormat(searchParams.get('format'), match[1]) };
  }

  return undefined;
}

async function handleCard(
  route: { slug: string; number: string; format: CardFormat },
  headOnly: boolean,
  deps: HandlerDeps,
): Promise<Response> {
  const chapter = getChapter(route.slug, route.number);
  if (!chapter) {
    // Either the series or the chapter number is not real; no such image exists.
    return notFound(`No chapter ${route.number} in series "${route.slug}"`);
  }

  const cache = await resolveCache(chapter.code, deps);
  const svg = buildSeriesCard({ ...chapter, cache });

  // A runtime without fonts would rasterise to an unreadable panel, so hand back
  // the vector card instead: the browser drawing it supplies its own fonts.
  const vectorOnly = route.format === 'svg' || !(deps.canRenderText ?? canRenderText)();

  const headers = new Headers({
    'cache-control': cache ? CARD_CACHE_CONTROL : DEGRADED_CARD_CACHE_CONTROL,
    'x-card-format': vectorOnly && route.format === 'png' ? 'svg-fallback' : route.format,
    // Whether the details made it into the card; useful when diagnosing an embed.
    'x-card-details': cache ? 'live' : 'unavailable',
  });

  if (vectorOnly) {
    headers.set('content-type', 'image/svg+xml; charset=utf-8');
    return withHeaders(headOnly ? null : svg, { status: 200, headers });
  }

  const png = (deps.renderPng ?? renderCardPng)(svg);
  headers.set('content-type', 'image/png');
  headers.set('content-length', String(png.byteLength));

  return withHeaders(headOnly ? null : png, { status: 200, headers });
}

function failureStatus(reason: CacheLookupFailure): number {
  if (reason === 'not-found' || reason === 'premium-only') return 404;
  if (reason === 'network') return 502;
  return 502;
}

function failureCacheControl(reason: CacheLookupFailure): string {
  return reason === 'network' || reason === 'unknown'
    ? UPSTREAM_FAILURE_CACHE_CONTROL
    : NEGATIVE_CACHE_CONTROL;
}

/** Reads one geocache from coord.info and answers with the lookup result. */
async function handleCache(code: string, headOnly: boolean, deps: HandlerDeps): Promise<Response> {
  const result = await lookupFor(deps)(code);

  if (result.ok) {
    if (headOnly) {
      return withHeaders(null, {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': CACHE_JSON_CACHE_CONTROL },
      });
    }

    return jsonResponse(result, 200, CACHE_JSON_CACHE_CONTROL);
  }

  const status = failureStatus(result.reason);
  const body = headOnly ? null : JSON.stringify(result);

  return withHeaders(body, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': failureCacheControl(result.reason),
      // The definitive reasons are not retries; say so for the client's benefit.
      'x-cache-lookup': result.reason,
    },
  });
}

export async function handleRequest(request: Request, deps: HandlerDeps = {}): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed();

  const url = new URL(request.url);
  const segments = pathSegments(url.pathname);
  const headOnly = request.method === 'HEAD';

  const cardRoute = resolveCardRoute(segments, url.searchParams);
  if (cardRoute) return handleCard(cardRoute, headOnly, deps);

  // Same two shapes as the card route: the rewritten query, or the real path.
  if (segments[0] === 'api' && segments[1] === 'serve') {
    const code = url.searchParams.get('code');
    if (code) return handleCache(code, headOnly, deps);
  }

  if (segments[0] === 'api' && segments[1] === 'cache' && segments.length >= 3) {
    return handleCache(segments[2], headOnly, deps);
  }

  return notFound(`Unknown route: ${url.pathname}`);
}
