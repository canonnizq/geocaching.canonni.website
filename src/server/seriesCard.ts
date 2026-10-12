/**
 * Composes the shareable card for one series chapter.
 *
 * Produces SVG so the same source can be served straight to a browser (crisp at
 * any size, no font dependency for the viewer) or rasterised to PNG elsewhere.
 * Colours and font stacks mirror the light theme in src/index.css, so a card
 * looks like a panel taken off the site itself, and it shares the site's date
 * formatting and chapter wording.
 *
 * Used by the Vercel function in api/ and by the static build scripts, so there
 * is exactly one implementation of the card's appearance.
 */
import type { Series } from '../data/series.ts';
import type { CacheDetails } from '../types/cache.ts';
import { formatHiddenDate } from '../lib/format.ts';
import { describeChapter, sanitize } from '../lib/chapterCard.ts';

export const CARD_WIDTH = 750;
export const CARD_HEIGHT = 250;

/** Must match the light-theme tokens in src/index.css. */
const COLOURS = {
  case: '#A69F8B',
  surface: '#CFC8B4',
  border: '#8E8775',
  borderStrong: '#57523F',
  text: '#24211A',
  textMuted: '#56513F',
  accent: '#25582A',
  lcdBg: '#C6CFB4',
  lcdInk: '#1C2417',
  lcdDim: '#474E36',
};

const SANS = 'Helvetica Neue,Helvetica,Arial,Liberation Sans,DejaVu Sans,sans-serif';
const MONO = 'SF Mono,Menlo,Consolas,Liberation Mono,DejaVu Sans Mono,monospace';

/** Advance widths as a fraction of the font size, good enough for fitting text. */
const NARROW = 0.53; // latin text
const WIDE = 1.0; // CJK, emoji and other full-width glyphs

export interface CardInput {
  series: Series;
  number: number;
  total: number;
  code: string;
  /**
   * The cache this chapter points at. Partial because a card is still worth
   * drawing when only some details are known, and absent when the cache could
   * not be read at all.
   */
  cache?: Partial<CacheDetails>;
}

export function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isWide(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;

  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f9ff)
  );
}

export function measureText(text: string, fontSize: number, letterSpacing = 0): number {
  let width = 0;

  for (const character of sanitize(text)) {
    width += fontSize * (isWide(character) ? WIDE : NARROW) + letterSpacing;
  }

  return width;
}

/** Shortens text to fit, using an ellipsis. Never splits a surrogate pair. */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
  letterSpacing = 0,
): string {
  const clean = sanitize(text);
  if (measureText(clean, fontSize, letterSpacing) <= maxWidth) return clean;

  const ellipsis = '…';
  const ellipsisWidth = measureText(ellipsis, fontSize, letterSpacing);
  let result = '';

  for (const character of clean) {
    if (measureText(result + character, fontSize, letterSpacing) + ellipsisWidth > maxWidth) break;
    result += character;
  }

  return result.trimEnd() + ellipsis;
}

/** Wraps text onto at most `maxLines`, ellipsising whatever does not fit. */
export function wrapToLines(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
  letterSpacing = 0,
): string[] {
  const words = sanitize(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (measureText(candidate, fontSize, letterSpacing) <= maxWidth || current === '') {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && current) lines.push(current);

  // Anything left over has to be folded into the last line as an ellipsis.
  if (current && lines.length === maxLines && lines[maxLines - 1] !== current) {
    const consumed = lines.join(' ').length;
    const remaining = sanitize(text).slice(consumed).trim();
    if (remaining) {
      lines[maxLines - 1] = truncateToWidth(
        `${lines[maxLines - 1]} ${remaining}`,
        maxWidth,
        fontSize,
        letterSpacing,
      );
    }
  }

  return lines
    .slice(0, maxLines)
    .map((line) => truncateToWidth(line, maxWidth, fontSize, letterSpacing));
}

/** Recessed edge: shaded top-left, lit bottom-right. */
function insetEdge(x: number, y: number, width: number, height: number, radius = 0): string {
  return `<path d="M ${x} ${y + height - radius} L ${x} ${y + radius} Q ${x} ${y} ${x + radius} ${y} L ${x + width - radius} ${y}"
     fill="none" stroke="#24211A" stroke-opacity="0.3" stroke-width="2"/>
  <path d="M ${x} ${y + height} L ${x + width} ${y + height} L ${x + width} ${y}"
     fill="none" stroke="#FFFFFF" stroke-opacity="0.4" stroke-width="1"/>`;
}

/** A metadata pill: muted label, then the value. */
function chip(
  x: number,
  y: number,
  label: string,
  value: string,
  maxWidth: number,
): { svg: string; width: number } {
  const fontSize = 11;
  const padding = 9;
  const gap = 5;
  const height = 20;

  const labelWidth = measureText(`${label} `, fontSize);
  const valueWidth = measureText(value, fontSize);
  const width = Math.min(padding * 2 + labelWidth + valueWidth, maxWidth);

  const svg = `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="3"
      fill="${COLOURS.surface}" stroke="${COLOURS.border}" stroke-width="1"/>
    <text x="${x + padding}" y="${y + 14}" font-family="${MONO}" font-size="${fontSize}">
      <tspan fill="${COLOURS.textMuted}">${escapeXml(label)} </tspan>
      <tspan fill="${COLOURS.text}" font-weight="600">${escapeXml(truncateToWidth(value, width - padding * 2 - labelWidth, fontSize))}</tspan>
    </text>
  </g>`;

  return { svg, width: x + width + gap };
}

/** Case screws, purely decorative. */
function screw(cx: number, cy: number): string {
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="5" fill="${COLOURS.surface}" stroke="${COLOURS.border}" stroke-width="1"/>
    <line x1="${cx - 3.2}" y1="${cy}" x2="${cx + 3.2}" y2="${cy}" stroke="#24211A" stroke-opacity="0.45" stroke-width="1.4"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="1"/>
  </g>`;
}

function formatNumber(value: number): string {
  return String(value).padStart(2, '0');
}

/** Builds the card for one chapter. */
export function buildSeriesCard({ series, number, total, code, cache }: CardInput): string {
  const title = sanitize(series?.title) || 'Untitled series';
  const summary = sanitize(series?.summary);
  const cacheName = sanitize(cache?.name);
  const canonicalUrl = `geocaching.canonni.website/series/${series?.slug ?? 'series'}/${number}`;

  const meta: Array<[string, string]> = [];
  if (cache) {
    if (cache.type) meta.push(['TYPE', cache.type]);
    if (typeof cache.difficulty === 'number' && typeof cache.terrain === 'number') {
      meta.push(['D/T', `${cache.difficulty.toFixed(1)} / ${cache.terrain.toFixed(1)}`]);
    }
    if (cache.size) meta.push(['SIZE', cache.size]);
    const hidden = formatHiddenDate(cache.hiddenDate ?? null);
    if (hidden) meta.push(['HIDDEN', hidden]);
    if (cache.owner) meta.push(['BY', cache.owner]);
  }

  // Cache title, wrapped into the space right of the readout.
  const titleLines = cacheName
    ? wrapToLines(cacheName, 328, 16, 3)
    : [sanitize(cache ? 'Untitled cache' : 'Cache details unavailable')];
  const titleSvg = titleLines
    .map(
      (line, index) =>
        `<text x="386" y="${130 + index * 19}" font-family="${SANS}" font-size="16" font-weight="700" fill="${COLOURS.text}">${escapeXml(line)}</text>`,
    )
    .join('\n');

  // Metadata pills, flowed over at most two rows.
  let chips = '';
  let cursorX = 386;
  let rowY = 180;
  let row = 0;
  for (const [label, value] of meta) {
    const result = chip(cursorX, rowY, label, value, 328);
    if (result.width - 386 > 328 && cursorX > 386) {
      row += 1;
      if (row > 1) break;
      cursorX = 386;
      rowY = 204;
      const wrapped = chip(cursorX, rowY, label, value, 328);
      chips += wrapped.svg;
      cursorX = wrapped.width;
      continue;
    }
    chips += result.svg;
    cursorX = result.width;
  }

  const { title: accessibleTitle } = describeChapter({ series, number, total, code, cache });

  const progress = total > 0 ? Math.max(number / total, 0.02) : 0;
  const railWidth = 676;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" role="img" aria-label="${escapeXml(accessibleTitle)}">
  <title>${escapeXml(accessibleTitle)}</title>
  <defs>
    <pattern id="lcdDots" width="4" height="4" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="${COLOURS.lcdInk}" fill-opacity="0.08"/>
    </pattern>
  </defs>

  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${COLOURS.case}"/>

  <g>
    <rect x="12" y="12" width="726" height="226" rx="6" fill="${COLOURS.surface}" stroke="${COLOURS.borderStrong}" stroke-width="2"/>
    ${screw(26, 26)}
    ${screw(724, 26)}
    ${screw(26, 224)}
    ${screw(724, 224)}
  </g>

  <g>
    <circle cx="42" cy="40" r="6" fill="${COLOURS.accent}" fill-opacity="0.25"/>
    <circle cx="42" cy="40" r="3" fill="${COLOURS.accent}"/>
    <text x="54" y="44" font-family="${MONO}" font-size="10" letter-spacing="1.6" fill="${COLOURS.textMuted}">GEOCACHING.CANONNI.WEBSITE</text>
    <text x="714" y="44" text-anchor="end" font-family="${MONO}" font-size="10" fill="${COLOURS.textMuted}">${escapeXml(truncateToWidth(canonicalUrl, 300, 10))}</text>
  </g>

  <text x="38" y="76" font-family="${SANS}" font-size="21" font-weight="700" fill="${COLOURS.text}" letter-spacing="0.4">${escapeXml(truncateToWidth(title.toUpperCase(), 664, 21, 0.4))}</text>
  ${summary ? `<text x="38" y="96" font-family="${SANS}" font-size="12" fill="${COLOURS.textMuted}">${escapeXml(truncateToWidth(summary, 664, 12))}</text>` : ''}

  <g>
    <rect x="38" y="106" width="326" height="94" rx="4" fill="${COLOURS.lcdBg}"/>
    <rect x="38" y="106" width="326" height="94" rx="4" fill="url(#lcdDots)"/>
    ${insetEdge(38, 106, 326, 94, 4)}
    <text x="54" y="134" font-family="${MONO}" font-size="11.5" letter-spacing="1.8" fill="${COLOURS.lcdDim}">CHAPTER ${formatNumber(number)} / ${formatNumber(total)}</text>
    <text x="54" y="174" font-family="${MONO}" font-size="30" font-weight="700" fill="${COLOURS.lcdInk}">${escapeXml(code)}</text>
  </g>

  ${titleSvg}
  ${chips}

  <g>
    <rect x="38" y="224" width="${railWidth}" height="6" rx="3" fill="${COLOURS.border}" fill-opacity="0.55"/>
    <rect x="38" y="224" width="${(railWidth * progress).toFixed(1)}" height="6" rx="3" fill="${COLOURS.accent}"/>
  </g>
</svg>
`;
}
