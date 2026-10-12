import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCacheDetails } from '../data/caches';
import type { CacheDetails, CacheLookupFailure, CacheLookupResult } from '../types/cache';

export type CacheItemState =
  | { status: 'loading' }
  | { status: 'loaded'; cache: CacheDetails }
  | { status: 'failed'; reason: CacheLookupFailure };

/**
 * Loads every cache in a series independently.
 *
 * Results are filed by slot rather than appended, where a slot is the series key
 * plus the code's index. State therefore always lines up with the provided order,
 * no matter which request finishes first, and a late response from a previous
 * series can't leak into the current one.
 */
export function useSeriesCaches(codes: string[]) {
  const codesKey = codes.join(',');
  const codeList = useMemo(() => (codesKey === '' ? [] : codesKey.split(',')), [codesKey]);

  const [results, setResults] = useState<Record<string, CacheLookupResult>>({});
  const inFlight = useRef(new Set<string>());

  const lookup = useCallback(async (code: string, slot: string) => {
    if (inFlight.current.has(slot)) return;
    inFlight.current.add(slot);

    try {
      const result = await fetchCacheDetails(code);
      setResults((previous) => ({ ...previous, [slot]: result }));
    } finally {
      inFlight.current.delete(slot);
    }
  }, []);

  useEffect(() => {
    codeList.forEach((code, index) => {
      void lookup(code, `${codesKey}:${index}`);
    });
  }, [codeList, codesKey, lookup]);

  const retry = useCallback(
    (index: number) => {
      const code = codeList[index];
      if (!code) return;

      const slot = `${codesKey}:${index}`;
      setResults((previous) => {
        const next = { ...previous };
        delete next[slot];
        return next;
      });
      void lookup(code, slot);
    },
    [codeList, codesKey, lookup],
  );

  const states: CacheItemState[] = codeList.map((_, index) => {
    const result = results[`${codesKey}:${index}`];
    if (!result) return { status: 'loading' };
    return result.ok
      ? { status: 'loaded', cache: result.cache }
      : { status: 'failed', reason: result.reason };
  });

  return { states, retry };
}
