import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import resvgPkg from '@resvg/resvg-js';
import { SERIES } from '../src/data/series.ts';
import { buildSeriesCard, escapeXml, measureText, truncateToWidth, wrapToLines } from '../src/server/seriesCard.ts';
// sanitize and describeChapter live with the site's copy so the app and the
// card cannot describe a chapter differently.
import { describeChapter, sanitize } from '../src/lib/chapterCard.ts';

const { Resvg } = resvgPkg;

const chapterSeries = SERIES.find((series) => series.slug === 'chapter');

/**
 * Cache details stand in for what coord.info returns at request time. Real
 * details would make these tests depend on geocaching.com, so the shape is what
 * matters here: chapter 5's code, as it would come back from a live lookup.
 */
const CACHE = {
  code: 'GCBX0AX',
  name: 'Test Cache',
  url: 'https://www.geocaching.com/geocache/GCBX0AX_test-cache',
  description: 'Line one\n\nLine two',
  shortDescription: 'Short text',
  owner: 'SomeOwner',
  hiddenDate: '5/11/2000',
  difficulty: 2,
  terrain: 3.5,
  size: 'small',
  type: 'Traditional Cache',
  region: 'Somewhere, China',
  favorites: 42,
  hint: 'The hint',
};

/** Distinguishes "use the fixture" from "this cache has no details". */
const FROM_FIXTURE = Symbol('from fixture');

function cardFor(slug, number, cacheOverride = FROM_FIXTURE) {
  const series = SERIES.find((entry) => entry.slug === slug);
  const code = series.codes[number - 1];
  // `null` means "pretend this cache could not be read".
  const cache = cacheOverride === FROM_FIXTURE ? { ...CACHE, code } : (cacheOverride ?? undefined);

  return buildSeriesCard({ series, number, total: series.codes.length, code, cache });
}

describe('sanitize', () => {
  it('drops characters XML cannot represent', () => {
    // resvg rejects the whole document if any of these reach the parser.
    assert.equal(sanitize('good\u0000\u0008\u001ftext'), 'goodtext');
    assert.equal(sanitize('ok\u007f'), 'ok');
  });

  it('drops lone surrogates but keeps real emoji', () => {
    assert.equal(sanitize('a\uD83Db'), 'ab');
    assert.equal(sanitize('💕 LOVE'), '💕 LOVE');
  });

  it('collapses whitespace and handles empty input', () => {
    assert.equal(sanitize('  a \n\n b  '), 'a b');
    assert.equal(sanitize(null), '');
    assert.equal(sanitize(undefined), '');
  });
});

describe('escapeXml', () => {
  it('neutralises markup so a cache title cannot break the SVG', () => {
    assert.equal(escapeXml('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&apos;&lt;/b&gt;');
  });
});

describe('text fitting', () => {
  it('measures CJK wider per character than latin text', () => {
    const cjkPerCharacter = measureText('环游浦江', 16) / 4;
    const latinPerCharacter = measureText('LuJiaZui', 16) / 8;

    assert.ok(cjkPerCharacter > latinPerCharacter);
    assert.equal(measureText('', 16), 0);
  });

  it('keeps truncated text inside its budget and marks the cut', () => {
    const text = 'A very long cache title that will not fit in the available space';
    const result = truncateToWidth(text, 120, 16);

    assert.ok(result.endsWith('…'));
    assert.ok(measureText(result, 16) <= 120, 'truncated text must fit');
  });

  it('leaves text that already fits untouched', () => {
    assert.equal(truncateToWidth('Short', 400, 16), 'Short');
  });

  it('wraps onto at most the requested number of lines, each within budget', () => {
    const lines = wrapToLines(
      'CHAPTER V - a rather long cache title that keeps going well past the column',
      328,
      16,
      3,
    );

    assert.ok(lines.length <= 3);
    for (const line of lines) assert.ok(measureText(line, 16) <= 328, `"${line}" must fit`);
    assert.equal(wrapToLines('One', 328, 16, 3).length, 1);
  });
});

describe('buildSeriesCard', () => {
  it('is a 750x250 image with an accessible name', () => {
    const svg = cardFor('chapter', 5);

    assert.match(svg, /^<svg /);
    assert.match(svg, /width="750" height="250"/);
    assert.match(svg, /role="img" aria-label="/);
    assert.match(svg, /<title>/);
  });

  it('carries the series, chapter and cache information', () => {
    const svg = cardFor('chapter', 5);
    const code = chapterSeries.codes[4];

    assert.ok(svg.includes('CHAPTER 05 / 32'), 'chapter position should be shown');
    assert.ok(svg.includes(code), 'geocache code should be shown');
    assert.ok(svg.includes('GEOCACHING.CANONNI.WEBSITE'), 'branding should be shown');
    assert.ok(svg.includes('Neither Powerful'), 'series summary should be shown');

    const cache = CACHE;
    assert.ok(svg.includes(sanitize(cache.name)), 'cache title should be shown');
    assert.ok(svg.includes(sanitize(cache.owner)), 'owner should be shown');
    // The site formats dates with the same helper, so the card must agree.
    assert.ok(!svg.includes(cache.hiddenDate), 'date should be formatted, not raw');
  });

  it('falls back cleanly when the cache could not be read', () => {
    const svg = cardFor('chapter', 5, null);

    assert.ok(svg.includes('CHAPTER 05 / 32'));
    assert.ok(svg.includes('Cache details unavailable'));
    assert.ok(!svg.includes('undefined'), 'no undefined should leak into the markup');
  });

  it('renders CJK and emoji titles rather than dropping them', () => {
    const cjk = cardFor('huangpu', 1);
    assert.ok(cjk.includes('环游浦江-黄浦'), 'CJK series title should survive');

    const love = cardFor('love', 1);
    assert.ok(love.includes('💕'), 'emoji series title should survive');
  });

  it('escapes hostile cache titles', () => {
    const svg = cardFor('chapter', 5, { name: '<script>alert(1)</script>', code: 'GCBX0AX' });

    assert.ok(!svg.includes('<script>'));
    assert.ok(svg.includes('&lt;script&gt;'));
  });
});

describe('describeChapter', () => {
  it('describes the same chapter consistently for the image and the page', () => {
    const series = chapterSeries;
    const code = series.codes[4];
    const { title, description } = describeChapter({
      series,
      number: 5,
      total: series.codes.length,
      code,
      cache: { ...CACHE, code },
    });

    assert.equal(title, `CHAPTER — chapter 5 of 32 (${code})`);
    assert.ok(description.includes(code));

    // The accessible label on the card is the same string.
    const svg = cardFor('chapter', 5);
    assert.ok(svg.includes(escapeXml(title)));
  });
});

describe('every chapter of every series', () => {
  it('composes and rasterises to a valid, non-empty PNG', () => {
    let count = 0;

    for (const series of SERIES) {
      for (const [index, code] of series.codes.entries()) {
        const svg = buildSeriesCard({
          series,
          number: index + 1,
          total: series.codes.length,
          code,
          // Every chapter is drawn both with details and without: a card must
          // survive a cache that coord.info will not answer for.
          cache: index % 2 === 0 ? { ...CACHE, code } : undefined,
        });

        const png = new Resvg(svg, { fitTo: { mode: 'width', value: 750 } }).render().asPng();

        assert.equal(png.subarray(1, 4).toString(), 'PNG', `${series.slug}/${index + 1} should render`);
        assert.equal(png.readUInt32BE(16), 750, 'width');
        assert.equal(png.readUInt32BE(20), 250, 'height');
        assert.ok(png.length > 3000, `${series.slug}/${index + 1} should not be blank`);
        count += 1;
      }
    }

    assert.ok(count >= 50, `expected the whole dataset to be covered, rendered ${count}`);
  });
});
