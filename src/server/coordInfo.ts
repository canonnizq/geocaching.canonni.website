/**
 * Fetches geocache details from coord.info.
 *
 * This has to run on a server rather than in the browser: coord.info redirects to
 * geocaching.com, which sends no CORS headers, so client-side JavaScript can
 * never read those pages. The Vercel function in api/ is the only caller; the
 * browser asks that function through src/data/caches.ts.
 *
 * The returned success shape matches `CacheLookupResult` in src/types/cache.ts.
 */
import * as cheerio from 'cheerio';
import type { CacheDetails } from '../types/cache.ts';

const COORD_INFO_BASE = 'https://coord.info/';

const REQUEST_HEADERS = {
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'geocaching.canonni.website cache fetcher (https://github.com/canonnizq)',
};

const CODE_PATTERN = /^GC[0-9A-Z]+$/i;

export type CoordInfoFailureReason = 'not-found' | 'premium-only' | 'network' | 'unknown';

export type CoordInfoResult =
  | { ok: true; cache: CacheDetails }
  | { ok: false; reason: CoordInfoFailureReason; code: string; message?: string };

export interface CoordInfoOptions {
  /** Swap in a stub under test; defaults to the runtime's global fetch. */
  fetchImpl?: typeof fetch;
  /** Abandon a slow page rather than holding the request that needed it open. */
  timeoutMs?: number;
}

type CheerioApi = ReturnType<typeof cheerio.load>;

function rot13(value: string): string {
  return value.replace(/[a-zA-Z]/g, (character) => {
    const base = character <= 'Z' ? 65 : 97;
    return String.fromCharCode(((character.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function textOf($: CheerioApi, selector: string): string | null {
  const element = $(selector).first();
  if (element.length === 0) return null;

  const text = element.text().replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

/**
 * Flattens description HTML into text: line breaks inside a block collapse to
 * spaces, block boundaries become blank lines. The timeline renders descriptions
 * with `white-space: pre-line`, so that structure survives to the screen.
 */
function htmlToText($: CheerioApi, selector: string): string | null {
  const element = $(selector).first();
  if (element.length === 0) return null;

  const clone = element.clone();
  clone.find('br').replaceWith('\n');
  clone.find('p, div, li, h1, h2, h3, h4, h5, h6, tr').append('\n\n');

  const text = clone
    .text()
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/(?<!\n)\n(?!\n)/g, ' ')
    .replace(/\n{2,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ');

  return text.trim() === '' ? null : text.trim();
}

/** A Premium Member Only page carries no cache data at all. */
function isPremiumOnlyPage(html: string): boolean {
  return html.includes('premium-upgrade-widget') || html.includes('Premium Member Only Cache');
}

function parseCache($: CheerioApi, code: string, url: string): CacheDetails {
  const title = textOf($, 'title') ?? '';
  const stars = $('.CacheStarLabels img')
    .map((_, image) => Number.parseFloat($(image).attr('alt') ?? ''))
    .get()
    .filter((value) => Number.isFinite(value));

  const sizeAlt = $('#ctl00_ContentBody_size img').first().attr('alt');
  const ownerElement = $('#ctl00_ContentBody_mcd1').first();
  const ownerLink = ownerElement.find('a').first().text().replace(/\s+/g, ' ').trim();
  const owner =
    ownerLink ||
    (textOf($, '#ctl00_ContentBody_mcd1') ?? '').replace(/^A cache by\s*/i, '').trim() ||
    null;

  const favoriteText = $('span.favorite-value').first().text().trim();
  const hintRaw = $('#div_hint').first().text().trim();

  return {
    code,
    name: textOf($, '#ctl00_ContentBody_CacheName') ?? '',
    url,
    // The page title reads "GCK25B Name in Washington, United States created by Owner".
    region: title.match(/\sin\s(.+?)\screated by\s/i)?.[1] ?? null,
    owner,
    hiddenDate: textOf($, '#ctl00_ContentBody_mcd2')?.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] ?? null,
    difficulty: stars[0] ?? null,
    terrain: stars[1] ?? null,
    size: sizeAlt ? sizeAlt.replace(/^Size:\s*/i, '').trim() : null,
    type: $("a[href*='cache_types.aspx']").first().attr('title') ?? null,
    favorites: /^\d+$/.test(favoriteText) ? Number(favoriteText) : null,
    shortDescription: textOf($, '#ctl00_ContentBody_ShortDescription'),
    description: htmlToText($, '#ctl00_ContentBody_LongDescription'),
    hint: hintRaw === '' ? null : rot13(hintRaw),
  };
}

/**
 * Resolves a single geocache. Never throws: transport and parse problems come
 * back as a failure reason so one bad code cannot break a whole series, or a
 * single request.
 */
export async function fetchCacheDetails(
  rawCode: string,
  { fetchImpl = fetch, timeoutMs }: CoordInfoOptions = {},
): Promise<CoordInfoResult> {
  const code = String(rawCode ?? '').trim().toUpperCase();

  if (!CODE_PATTERN.test(code)) {
    return { ok: false, reason: 'not-found', code, message: `"${rawCode}" is not a geocache code` };
  }

  let response: Response;
  try {
    response = await fetchImpl(COORD_INFO_BASE + encodeURIComponent(code), {
      headers: REQUEST_HEADERS,
      redirect: 'follow',
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    });
  } catch (error) {
    // An aborted request is a network failure here: from the caller's side, a
    // page that never arrived is the same as one that could not be reached.
    return { ok: false, reason: 'network', code, message: (error as Error).message };
  }

  if (response.status === 404) {
    return { ok: false, reason: 'not-found', code };
  }

  if (!response.ok) {
    return { ok: false, reason: 'unknown', code, message: `coord.info responded ${response.status}` };
  }

  let html: string;
  try {
    html = await response.text();
  } catch (error) {
    // The headers arrived but the body did not: the request was aborted part way
    // through, or the connection dropped. Still one failed read, and the caller
    // should see it as such rather than as a crash.
    return { ok: false, reason: 'network', code, message: (error as Error).message };
  }

  if (isPremiumOnlyPage(html)) {
    return { ok: false, reason: 'premium-only', code };
  }

  const $ = cheerio.load(html);
  const cache = parseCache($, code, response.url);

  if (!cache.name) {
    return {
      ok: false,
      reason: 'unknown',
      code,
      message: 'Cache name not found — the page layout may have changed',
    };
  }

  return { ok: true, cache };
}

/** Spacing helper for the batch fetch script, which walks codes slowly on purpose. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
