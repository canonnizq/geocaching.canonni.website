// The explicit .ts extension keeps this file importable by plain Node, which the
// scripts and tests rely on; tsconfig sets allowImportingTsExtensions for it.
import { getSeries, type Series } from './series.ts';

/**
 * One entry of a series. A chapter is simply a position in `Series.codes`, so
 * every series has chapters without needing any extra data, and a newly added
 * code becomes a chapter the moment it is listed.
 */
export interface SeriesChapter {
  series: Series;
  /** 1-based position within the series, as used in URLs. */
  number: number;
  /** How many chapters the parent series has. */
  total: number;
  /** The geocache code this chapter points at. */
  code: string;
}

export function listChapters(series: Series): SeriesChapter[] {
  return series.codes.map((code, index) => ({
    series,
    number: index + 1,
    total: series.codes.length,
    code,
  }));
}

/**
 * Reads the chapter number out of a URL segment. Only plain digits are accepted,
 * so "5" works and "5.png", "-1" or "abc" do not.
 */
export function parseChapterNumber(raw: string | undefined): number | undefined {
  if (!raw || !/^\d{1,4}$/.test(raw)) return undefined;

  const number = Number(raw);
  return number >= 1 ? number : undefined;
}

/** Resolves a chapter from its URL parts, or undefined when there is no such chapter. */
export function getChapter(
  slug: string | undefined,
  rawNumber: string | undefined,
): SeriesChapter | undefined {
  const series = slug ? getSeries(slug) : undefined;
  if (!series) return undefined;

  const number = parseChapterNumber(rawNumber);
  if (number === undefined || number > series.codes.length) return undefined;

  return { series, number, total: series.codes.length, code: series.codes[number - 1] };
}

/** The page URL for a chapter, matching the generated static directory. */
export function chapterPath(chapter: SeriesChapter): string {
  return chapterPathFor(chapter.series.slug, chapter.number);
}

export function chapterPathFor(slug: string, number: number): string {
  return `/series/${slug}/${number}`;
}

/**
 * The embeddable image URL for a chapter — stable, so external sites can hardcode
 * it. The image is drawn on request from live cache data, so this URL's bytes can
 * change when the cache does; the CDN's own caching is what keeps it cheap.
 */
export function chapterImagePath(chapter: SeriesChapter): string {
  return `/series/${chapter.series.slug}/${chapter.number}/image.png`;
}

/** The vector card, for embeds that want it crisp at any size. */
export function chapterSvgPath(chapter: SeriesChapter): string {
  return `/series/${chapter.series.slug}/${chapter.number}/image.svg`;
}
