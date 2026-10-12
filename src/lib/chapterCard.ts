import type { Series } from '../data/series.ts';
import type { CacheDetails } from '../types/cache.ts';

/**
 * Characters XML cannot carry, plus the C0/C1 control ranges and DEL, which are
 * legal but would render as invisible junk in a card. Lone surrogates are
 * unpaired halves of an astral character and cannot be encoded either.
 */
function isStrippable(codePoint: number): boolean {
  return (
    (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) ||
    codePoint === 0x7f ||
    (codePoint >= 0x80 && codePoint <= 0x9f) ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
    codePoint === 0xfffe ||
    codePoint === 0xffff
  );
}

/**
 * Cache titles are scraped from a web page, so anything XML cannot represent is
 * stripped before the text is used in generated markup. Returns a single line.
 */
export function sanitize(value: string | null | undefined): string {
  if (!value) return '';

  let cleaned = '';
  for (const character of String(value)) {
    if (!isStrippable(character.codePointAt(0) ?? 0)) cleaned += character;
  }

  return cleaned.replace(/\s+/g, ' ').trim();
}

export interface ChapterCopyInput {
  series: Series;
  number: number;
  total: number;
  code: string;
  /** Only the name is used, and it may be unknown. */
  cache?: Partial<CacheDetails>;
}

/**
 * The words that describe a chapter. The card image (title and aria-label) and
 * the chapter page (heading and alt text) both come from here, so the two can
 * never describe the same chapter differently.
 */
export function describeChapter({ series, number, total, code, cache }: ChapterCopyInput): {
  title: string;
  description: string;
} {
  const seriesTitle = sanitize(series.title) || 'Untitled series';
  const cacheName = sanitize(cache?.name);

  const title = `${seriesTitle} — chapter ${number} of ${total} (${code})`;

  const parts: string[] = [];
  if (cacheName) parts.push(`${cacheName}.`);
  parts.push(`Geocache ${code}, chapter ${number} of ${total} in ${seriesTitle}.`);
  const summary = sanitize(series.summary);
  if (summary) parts.push(summary);

  return { title, description: parts.join(' ') };
}
