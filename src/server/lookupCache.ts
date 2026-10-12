/**
 * Remembers geocache lookups for the life of a serverless instance.
 *
 * The CDN in front of the function already spares coord.info most repeat
 * requests, but it cannot help within a single burst: a series page asks for its
 * codes one at a time, and the chapter page then asks for the same code again as
 * a card. This keeps that burst to one upstream read per code, and it collapses
 * duplicate concurrent lookups onto a single request.
 *
 * Failures are remembered too, but only briefly, so a code that is genuinely
 * gone is not re-read on every request while a transient error still clears.
 */
import type { CoordInfoResult } from './coordInfo.ts';

export interface LookupCacheOptions {
  /** How long a resolved cache is reused before coord.info is asked again. */
  successTtlMs?: number;
  /** How long a failure is remembered. */
  failureTtlMs?: number;
  /**
   * How many codes to remember at once, oldest evicted first. Far more than any
   * series needs; a bound so a stream of distinct codes cannot grow without end.
   */
  maxEntries?: number;
  /** Injectable clock, for tests. */
  now?: () => number;
}

/** Never expires, so concurrent callers share the one request already running. */
const IN_FLIGHT = Number.POSITIVE_INFINITY;

/**
 * Both entries are deliberately shorter than the CDN's own caching, which holds
 * a success for a day and a failure for five minutes: this is only about what
 * one instance does between requests that reach it.
 */
export function createLookupCache(
  lookup: (code: string) => Promise<CoordInfoResult>,
  {
    successTtlMs = 60 * 60 * 1000,
    failureTtlMs = 60 * 1000,
    maxEntries = 500,
    now = Date.now,
  }: LookupCacheOptions = {},
): (code: string) => Promise<CoordInfoResult> {
  const entries = new Map<string, { result: Promise<CoordInfoResult>; expiresAt: number }>();

  return (rawCode) => {
    const code = String(rawCode ?? '').trim().toUpperCase();
    const remembered = entries.get(code);
    if (remembered && remembered.expiresAt > now()) return remembered.result;

    const result = lookup(code).then(
      (settled) => {
        // Only the entry holding this exact promise may be rewritten, so a slow
        // lookup that finishes late cannot extend a newer answer's life.
        if (entries.get(code)?.result === result) {
          entries.set(code, { result, expiresAt: now() + (settled.ok ? successTtlMs : failureTtlMs) });
        }

        return settled;
      },
      (error: unknown) => {
        entries.delete(code);
        throw error;
      },
    );

    entries.set(code, { result, expiresAt: IN_FLIGHT });

    if (entries.size > maxEntries) {
      const oldest = entries.keys().next();
      if (!oldest.done) entries.delete(oldest.value);
    }

    return result;
  };
}
