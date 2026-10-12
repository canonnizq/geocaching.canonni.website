import type { CacheDetails } from '../types/cache';
import { formatHiddenDate } from './format';

/** The label/value pairs shown for a cache, in a fixed order. */
export function buildMeta(cache: CacheDetails): Array<{ label: string; value: string }> {
  const meta: Array<{ label: string; value: string }> = [];
  const hidden = formatHiddenDate(cache.hiddenDate);

  if (cache.type) meta.push({ label: 'Type', value: cache.type });
  if (cache.size) meta.push({ label: 'Size', value: cache.size });
  if (cache.difficulty !== null) meta.push({ label: 'Difficulty', value: `${cache.difficulty.toFixed(1)} / 5` });
  if (cache.terrain !== null) meta.push({ label: 'Terrain', value: `${cache.terrain.toFixed(1)} / 5` });
  if (hidden) meta.push({ label: 'Hidden', value: hidden });
  if (cache.owner) meta.push({ label: 'Placed by', value: cache.owner });
  if (cache.favorites) meta.push({ label: 'Favorites', value: String(cache.favorites) });
  if (cache.region) meta.push({ label: 'Region', value: cache.region });

  return meta;
}


