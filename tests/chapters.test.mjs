import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SERIES } from '../src/data/series.ts';
import {
  chapterImagePath,
  chapterPath,
  chapterPathFor,
  chapterSvgPath,
  getChapter,
  listChapters,
  parseChapterNumber,
} from '../src/data/chapters.ts';

describe('parseChapterNumber', () => {
  it('accepts plain positive integers', () => {
    assert.equal(parseChapterNumber('1'), 1);
    assert.equal(parseChapterNumber('5'), 5);
    assert.equal(parseChapterNumber('32'), 32);
  });

  it('accepts leading zeros, which are the same chapter', () => {
    assert.equal(parseChapterNumber('05'), 5);
    assert.equal(parseChapterNumber('0005'), 5);
  });

  it('rejects anything that is not a chapter number', () => {
    for (const value of ['0', '-1', 'abc', '', ' ', '5.png', '5/6', '12345', '1.5', '∞']) {
      assert.equal(parseChapterNumber(value), undefined, `expected ${JSON.stringify(value)} to be rejected`);
    }
    assert.equal(parseChapterNumber(undefined), undefined);
  });
});

describe('getChapter', () => {
  it('resolves a chapter from its series slug and number', () => {
    const chapter = getChapter('chapter', '5');

    assert.ok(chapter);
    assert.equal(chapter.number, 5);
    assert.equal(chapter.total, 32);
    assert.equal(chapter.code, 'GCBX0AX');
    assert.equal(chapter.series.slug, 'chapter');
  });

  it('maps the number onto the right entry of the series', () => {
    for (const series of SERIES) {
      for (const [index, code] of series.codes.entries()) {
        const chapter = getChapter(series.slug, String(index + 1));
        assert.ok(chapter, `${series.slug} chapter ${index + 1} should resolve`);
        assert.equal(chapter.code, code);
      }
    }
  });

  it('rejects unknown series and out-of-range chapters', () => {
    assert.equal(getChapter('nope', '1'), undefined);
    assert.equal(getChapter(undefined, '1'), undefined);
    assert.equal(getChapter('chapter', undefined), undefined);
    assert.equal(getChapter('chapter', '0'), undefined);
    assert.equal(getChapter('chapter', '33'), undefined);
    assert.equal(getChapter('chapter', '9999'), undefined);
  });

  it('rejects the image path as if it were a chapter', () => {
    // /series/chapter/5/image must not resolve as chapter "5/image".
    assert.equal(getChapter('chapter', '5/image.png'), undefined);
  });
});

describe('listChapters', () => {
  it('numbers every series 1..n without touching the source data', () => {
    for (const series of SERIES) {
      const chapters = listChapters(series);

      assert.equal(chapters.length, series.codes.length);
      assert.deepEqual(
        chapters.map((chapter) => chapter.number),
        series.codes.map((_, index) => index + 1),
      );
      assert.ok(chapters.every((chapter) => chapter.total === series.codes.length));
    }
  });
});

describe('chapter URLs', () => {
  it('builds the page and image URLs the generator writes to disk', () => {
    const chapter = getChapter('chapter', '5');
    assert.ok(chapter);

    assert.equal(chapterPath(chapter), '/series/chapter/5');
    assert.equal(chapterPathFor('chapter', 5), '/series/chapter/5');
    assert.equal(chapterImagePath(chapter), '/series/chapter/5/image.png');
    assert.equal(chapterSvgPath(chapter), '/series/chapter/5/image.svg');
  });

  it('gives every chapter a distinct page and image URL', () => {
    const pages = SERIES.flatMap((series) => listChapters(series).map((chapter) => chapterPath(chapter)));
    const images = SERIES.flatMap((series) =>
      listChapters(series).map((chapter) => chapterImagePath(chapter)),
    );

    assert.equal(new Set(pages).size, pages.length);
    assert.equal(new Set(images).size, images.length);
  });
});
