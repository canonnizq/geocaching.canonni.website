import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { fetchCacheDetails } from '../src/data/caches.ts';

/**
 * The browser-side data layer. It talks to this site's own /api/cache route, so
 * these tests stand in for that route rather than for coord.info: what matters
 * here is that every answer it can give — including the ones no cache ever
 * produces — becomes a result the timeline can render.
 */
const realFetch = globalThis.fetch;

function stubFetch(handler) {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler();
  };

  return calls;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const CACHE = {
  code: 'GCZZZZ1',
  name: 'Test Cache',
  url: 'https://www.geocaching.com/geocache/GCZZZZ1_test-cache',
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

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('fetchCacheDetails', () => {
  it('reads the cache from this site\u2019s own API', async () => {
    const calls = stubFetch(() => json({ ok: true, cache: CACHE }));
    const result = await fetchCacheDetails('gczzzz1');

    assert.deepEqual(result, { ok: true, cache: CACHE });
    assert.equal(calls[0].url, '/api/cache/GCZZZZ1', 'the code is normalised and the path is relative');
  });

  it('encodes whatever it is given rather than pasting it into the URL', async () => {
    const calls = stubFetch(() => json({ ok: true, cache: CACHE }));
    await fetchCacheDetails('not a code');

    assert.equal(calls[0].url, '/api/cache/NOT%20A%20CODE');
  });

  it('does not ask about a blank code', async () => {
    const calls = stubFetch(() => json({ ok: true, cache: CACHE }));

    assert.deepEqual(await fetchCacheDetails('   '), { ok: false, reason: 'not-found' });
    assert.deepEqual(calls, [], 'nothing to look up, so nothing is requested');
  });

  it('keeps the reason the API gave', async () => {
    for (const reason of ['not-found', 'premium-only', 'network', 'unknown']) {
      stubFetch(() => json({ ok: false, reason }, 404));
      assert.deepEqual(await fetchCacheDetails('GCZZZZ1'), { ok: false, reason }, reason);
    }
  });

  it('falls back to the status when the body says nothing useful', async () => {
    // Something answered that is not this site's API: a proxy error page, or a
    // static host with no function behind it.
    stubFetch(() => new Response('<html>Not found</html>', { status: 404 }));
    assert.deepEqual(await fetchCacheDetails('GCZZZZ1'), { ok: false, reason: 'not-found' });

    stubFetch(() => new Response('Bad gateway', { status: 502 }));
    assert.deepEqual(await fetchCacheDetails('GCZZZZ1'), { ok: false, reason: 'network' });

    stubFetch(() => new Response('', { status: 418 }));
    assert.deepEqual(await fetchCacheDetails('GCZZZZ1'), { ok: false, reason: 'unknown' });
  });

  it('treats a request that never arrived as a network failure', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });

    assert.deepEqual(await fetchCacheDetails('GCZZZZ1'), { ok: false, reason: 'network' });
  });

  it('refuses a success that carries no cache', async () => {
    for (const body of [{ ok: true }, { cache: { name: 'no code' } }, { cache: 'GCZZZZ1' }, null]) {
      stubFetch(() => json(body));
      assert.deepEqual(await fetchCacheDetails('GCZZZZ1'), { ok: false, reason: 'unknown' }, JSON.stringify(body));
    }
  });

  it('gives up rather than spinning for ever', async () => {
    let signal;
    globalThis.fetch = (_url, init) => {
      signal = init.signal;
      // Real fetch rejects when the signal aborts; this stands in for that.
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      });
    };

    const pending = fetchCacheDetails('GCZZZZ1');
    assert.ok(signal instanceof AbortSignal, 'the request must be able to time out');

    // AbortSignal.timeout aborts exactly this way, and firing it here keeps the
    // test from waiting out the full fifteen seconds.
    signal.dispatchEvent(new Event('abort'));

    assert.deepEqual(await pending, { ok: false, reason: 'network' });
  });
});
