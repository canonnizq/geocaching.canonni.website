/** Details for a single geocache, as resolved by the data layer. */
export interface CacheDetails {
  code: string;
  name: string;
  url: string;
  description: string | null;
  shortDescription: string | null;
  owner: string | null;
  /** Hidden date exactly as coord.info reports it, e.g. "5/11/2000". */
  hiddenDate: string | null;
  difficulty: number | null;
  terrain: number | null;
  size: string | null;
  type: string | null;
  region: string | null;
  favorites: number | null;
  hint: string | null;
}

/** Why a cache lookup could not be resolved. */
export type CacheLookupFailure = 'not-found' | 'premium-only' | 'network' | 'unknown';

/**
 * Result of a single cache lookup. Failures are values rather than exceptions so
 * one bad cache can never take down the rest of the series.
 */
export type CacheLookupResult =
  | { ok: true; cache: CacheDetails }
  | { ok: false; reason: CacheLookupFailure };
