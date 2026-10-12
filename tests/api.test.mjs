import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleRequest } from '../src/server/handlers.ts';
import { createLookupCache } from '../src/server/lookupCache.ts';
import { SERIES } from '../src/data/series.ts';

/**
 * A page shaped like a real coord.info listing: same selectors, invented
 * content. Using a fixture rather than the live site keeps these tests
 * deterministic and avoids hitting geocaching.com on every run.
 */
const CACHE_PAGE = `<!doctype html><html><head>
<title>GCZZZZ1 Test Cache in Somewhere, China created by Someone</title></head><body>
<span id="ctl00_ContentBody_CacheName">Test Cache</span>
<div class="CacheStarLabels"><img alt="2 out of 5"><img alt="3.5 out of 5"></div>
<span id="ctl00_ContentBody_size"><img alt="Size: small"></span>
<p id="ctl00_ContentBody_mcd1">A cache by <a href="/profile">SomeOwner</a></p>
<p id="ctl00_ContentBody_mcd2">Hidden : 5/11/2000</p>
<a href="/about/cache_types.aspx" title="Traditional Cache">type</a>
<div id="ctl00_ContentBody_ShortDescription">Short text</div>
<div id="ctl00_ContentBody_LongDescription"><p>Line one</p><p>Line two</p></div>
<div id="div_hint">Gur uvag</div>
<span class="favorite-value">42</span>
</body></html>`;

/** A fetch stand-in; records the URLs it was asked for. */
function stubFetch({ html = CACHE_PAGE, status = 200, throws = false } = {}) {
  const calls = [];

  const impl = async (url) => {
    calls.push(String(url));
    if (throws) throw new Error('network down');

    return {
      status,
      ok: status >= 200 && status < 300,
      url: 'https://www.geocaching.com/geocache/GCZZZZ1_test-cache',
      text: async () => html,
    };
  };

  return { impl, calls };
}

const request = (path, init) => new Request(`https://geocaching.canonni.website${path}`, init);

/**
 * Every handler test injects transport: nothing here may reach geocaching.com,
 * and an injected fetch also turns off the shared memo, so each test sees
 * exactly the requests it caused.
 */
const deps = (extra = {}) => ({ canRenderText: () => true, fetchImpl: stubFetch().impl, ...extra });

describe('card route', () => {
  it('serves a PNG at the public embed URL', async () => {
    const response = await handleRequest(request('/series/chapter/5/image.png'), deps());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');

    const png = new Uint8Array(await response.arrayBuffer());
    assert.equal(Buffer.from(png.subarray(1, 4)).toString(), 'PNG');
    assert.equal(Buffer.from(png).readUInt32BE(16), 750, 'width');
    assert.equal(Buffer.from(png).readUInt32BE(20), 250, 'height');
  });

  it('serves the same card through the function path with an explicit format', async () => {
    const response = await handleRequest(request('/api/card/chapter/5?format=png'), deps());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
  });

  it('serves SVG with the right content type', async () => {
    const response = await handleRequest(request('/series/chapter/5/image.svg'), deps());
    const svg = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
    assert.match(svg, /^<svg /);
    assert.ok(svg.includes('CHAPTER 05 / 32'), 'the card should identify the chapter');
    assert.ok(svg.includes('GEOCACHING.CANONNI.WEBSITE'), 'the card should be branded');
  });

  it('takes the shape Vercel rewrites the embed URL into', async () => {
    // vercel.json turns /series/love/1/image.png into this, with the captured
    // segments as query parameters.
    const response = await handleRequest(
      request('/api/serve?slug=love&number=1&format=png'),
      deps({ fetchImpl: stubFetch().impl }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
  });

  it('serves SVG through the rewritten shape too', async () => {
    const response = await handleRequest(
      request('/api/serve?slug=love&number=1&format=svg'),
      deps({ fetchImpl: stubFetch().impl }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  });

  it('gives embeds a cacheable response, never an immutable one', async () => {
    // The card is drawn from live cache details, so no URL can promise its bytes
    // will never change.
    const response = await handleRequest(request('/series/chapter/5/image.png'), deps());

    assert.match(response.headers.get('cache-control'), /s-maxage=3600/);
    assert.match(response.headers.get('cache-control'), /stale-while-revalidate=\d+/);
    assert.ok(!response.headers.get('cache-control').includes('immutable'));
  });

  it('caches a card drawn without details only briefly', async () => {
    const response = await handleRequest(
      request('/series/chapter/5/image.png'),
      deps({ fetchImpl: stubFetch({ status: 404 }).impl }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-card-details'), 'unavailable');
    assert.match(response.headers.get('cache-control'), /s-maxage=300/);
  });

  it('serves SVG when the runtime has no fonts, rather than a wordless PNG', async () => {
    const response = await handleRequest(
      request('/series/chapter/5/image.png'),
      deps({ canRenderText: () => false }),
    );
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
    assert.equal(response.headers.get('x-card-format'), 'svg-fallback');
    assert.match(body, /^<svg /);
  });

  it('returns 404 for a chapter that does not exist', async () => {
    for (const path of ['/series/chapter/33/image.png', '/series/nope/1/image.png', '/series/chapter/0/image.png']) {
      const response = await handleRequest(request(path), deps());
      assert.equal(response.status, 404, `${path} should be 404`);
      assert.match(response.headers.get('cache-control'), /s-maxage/);
    }
  });

  it('does not treat a non-image path as a card', async () => {
    // /series/chapter/5.png is not one of the embed URLs and must not resolve.
    const response = await handleRequest(request('/series/chapter/5.png'), deps());
    assert.equal(response.status, 404);
  });

  it('answers HEAD with headers and no body', async () => {
    const response = await handleRequest(request('/series/chapter/5/image.png', { method: 'HEAD' }), deps());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  });
});

describe('card route details', () => {
  it('reads the cache from coord.info and puts it in the card', async () => {
    const { impl, calls } = stubFetch();
    const response = await handleRequest(
      request('/series/chapter/5/image.svg'),
      deps({ fetchImpl: impl }),
    );
    const svg = await response.text();

    assert.deepEqual(calls, ['https://coord.info/GCBX0AX'], 'chapter 5 decides which code is read');
    assert.equal(response.headers.get('x-card-details'), 'live');
    assert.ok(svg.includes('Test Cache'), 'the cache name should be on the card');
    assert.ok(svg.includes('SomeOwner'), 'so should its owner');
  });

  it('still draws a card when the cache cannot be resolved', async () => {
    const { impl } = stubFetch({ status: 404 });
    const response = await handleRequest(
      request('/api/card/love/2?format=svg'),
      deps({ fetchImpl: impl }),
    );
    const svg = await response.text();

    assert.equal(response.status, 200);
    assert.ok(svg.includes('Cache details unavailable'));
    assert.ok(svg.includes('CHAPTER 02 / 04'));
  });
});

describe('cache route', () => {
  it('reads a cache from coord.info and returns it as JSON', async () => {
    const { impl, calls } = stubFetch();
    const response = await handleRequest(request('/api/cache/gczzzz1'), deps({ fetchImpl: impl }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.match(response.headers.get('cache-control'), /s-maxage=/);
    assert.deepEqual(calls, ['https://coord.info/GCZZZZ1'], 'the code should be normalised');

    assert.equal(body.ok, true);
    assert.equal(body.cache.name, 'Test Cache');
    assert.equal(body.cache.code, 'GCZZZZ1');
    assert.equal(body.cache.owner, 'SomeOwner');
    assert.equal(body.cache.hiddenDate, '5/11/2000');
    assert.equal(body.cache.difficulty, 2);
    assert.equal(body.cache.terrain, 3.5);
    assert.equal(body.cache.size, 'small');
    assert.equal(body.cache.type, 'Traditional Cache');
    assert.equal(body.cache.favorites, 42);
    assert.equal(body.cache.region, 'Somewhere, China');
    assert.equal(body.cache.shortDescription, 'Short text');
    assert.equal(body.cache.description, 'Line one\n\nLine two');
    assert.equal(body.cache.hint, 'The hint', 'hints are stored in ROT13');
    assert.equal(body.cache.url, 'https://www.geocaching.com/geocache/GCZZZZ1_test-cache');
  });

  it('returns 404 with a reason for a code that does not exist', async () => {
    const { impl } = stubFetch({ status: 404 });
    const response = await handleRequest(request('/api/cache/GCZZZZ1'), deps({ fetchImpl: impl }));
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.ok, false);
    assert.equal(body.reason, 'not-found');
    assert.equal(response.headers.get('x-cache-lookup'), 'not-found');
  });

  it('returns 404 for a Premium Member Only page', async () => {
    const { impl } = stubFetch({ html: '<html><body><div id="premium-upgrade-widget"></div></body></html>' });
    const response = await handleRequest(request('/api/cache/GCZZZZ1'), deps({ fetchImpl: impl }));
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.reason, 'premium-only');
  });

  it('returns 502, not a cached 200, when coord.info is unreachable', async () => {
    const { impl } = stubFetch({ throws: true });
    const response = await handleRequest(request('/api/cache/GCZZZZ1'), deps({ fetchImpl: impl }));
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.reason, 'network');
    // Short-lived, so a temporary outage is retried rather than pinned.
    assert.match(response.headers.get('cache-control'), /s-maxage=60/);
  });

  it('answers with a failure, not a crash, when the body never arrives', async () => {
    // A timeout that fires after the headers: the read itself is what fails.
    const impl = async () => ({
      status: 200,
      ok: true,
      url: 'https://www.geocaching.com/geocache/GCZZZZ1_test-cache',
      text: async () => {
        throw new Error('The operation was aborted due to timeout');
      },
    });

    const response = await handleRequest(request('/api/cache/GCZZZZ1'), deps({ fetchImpl: impl }));
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.reason, 'network');
  });

  it('rejects a request that is not a geocache code without going upstream', async () => {
    const { impl, calls } = stubFetch();
    const response = await handleRequest(request('/api/cache/notacode'), deps({ fetchImpl: impl }));

    assert.equal(response.status, 404);
    assert.deepEqual(calls, []);
  });
});

describe('routing and methods', () => {
  it('rejects anything that is not GET or HEAD', async () => {
    const response = await handleRequest(request('/api/cache/GCZZZZ1', { method: 'POST' }), deps());

    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  });

  it('404s an unknown route rather than falling through to a page', async () => {
    const response = await handleRequest(request('/api/nonsense'), deps());
    assert.equal(response.status, 404);
  });
});

describe('every chapter', () => {
  it('can be rendered by the function', async () => {
    let count = 0;

    for (const series of SERIES) {
      for (const [index] of series.codes.entries()) {
        const response = await handleRequest(
          request(`/series/${series.slug}/${index + 1}/image.svg`),
          deps(),
        );

        assert.equal(response.status, 200, `${series.slug}/${index + 1}`);
        count += 1;
      }
    }

    assert.ok(count >= 50, `expected the whole dataset, rendered ${count}`);
  });

  it('reflects the details coord.info returned for that chapter', async () => {
    // A card may vary with what upstream says; it must never disagree with it.
    const { impl } = stubFetch({
      html: CACHE_PAGE.replaceAll('Test Cache', 'Another Cache').replaceAll('SomeOwner', 'Someone Else'),
    });
    const response = await handleRequest(
      request('/series/chapter/5/image.svg'),
      deps({ fetchImpl: impl }),
    );
    const svg = await response.text();

    assert.ok(svg.includes('Another Cache'));
    assert.ok(svg.includes('Someone Else'));
  });
});

describe('the shared lookup cache', () => {
  const ok = (code) => ({ ok: true, cache: { code, name: 'Test Cache' } });

  it('answers a repeated code from memory, and an expired one afresh', async () => {
    let calls = 0;
    let clock = 0;
    const lookup = createLookupCache(
      async () => {
        calls += 1;
        return ok('GCZZZZ1');
      },
      { now: () => clock },
    );

    await lookup('gczzzz1');
    await lookup('GCZZZZ1');
    assert.equal(calls, 1, 'both spellings are the same cache');

    clock += 61 * 60 * 1000;
    await lookup('GCZZZZ1');
    assert.equal(calls, 2, 'an hour is long enough to have to ask again');
  });

  it('collapses concurrent lookups of one code onto a single request', async () => {
    let calls = 0;
    const lookup = createLookupCache(async () => {
      calls += 1;
      return ok('GCZZZZ1');
    });

    await Promise.all([lookup('GCZZZZ1'), lookup('GCZZZZ1'), lookup('GCZZZZ1')]);
    assert.equal(calls, 1);
  });

  it('forgets a failure far sooner than a success', async () => {
    let calls = 0;
    let clock = 0;
    const lookup = createLookupCache(
      async (code) => {
        calls += 1;
        return calls === 1 ? { ok: false, reason: 'network', code } : ok(code);
      },
      { now: () => clock },
    );

    assert.equal((await lookup('GCZZZZ1')).ok, false);
    clock += 61 * 1000;
    assert.equal((await lookup('GCZZZZ1')).ok, true, 'a minute is all a failure is worth');
    assert.equal(calls, 2);
  });

  it('does not remember a lookup that threw', async () => {
    let calls = 0;
    const lookup = createLookupCache(async () => {
      calls += 1;
      if (calls === 1) throw new Error('upstream exploded');
      return ok('GCZZZZ1');
    });

    await assert.rejects(() => lookup('GCZZZZ1'));
    assert.equal((await lookup('GCZZZZ1')).ok, true);
    assert.equal(calls, 2);
  });

  it('stays within its entry limit, evicting the oldest', async () => {
    const seen = [];
    const lookup = createLookupCache(
      async (code) => {
        seen.push(code);
        return ok(code);
      },
      { maxEntries: 2 },
    );

    await lookup('GCAAA01');
    await lookup('GCAAA02');
    await lookup('GCAAA03');
    await lookup('GCAAA01');

    assert.deepEqual(seen, ['GCAAA01', 'GCAAA02', 'GCAAA03', 'GCAAA01']);
  });
});
