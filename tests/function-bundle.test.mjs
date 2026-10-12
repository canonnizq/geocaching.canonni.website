import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildFunction, BUNDLE_PATH } from '../scripts/build-function.mjs';

/**
 * The function Vercel deploys is the bundle built here, not the sources.
 *
 * Vercel compiles each TypeScript file separately and does not rewrite import
 * specifiers, so a function that imports the sources arrives asking for
 * "./handlers.ts" beside a file emitted as "./handlers.js" and dies with
 * ERR_MODULE_NOT_FOUND on every request — a failure that no test of the sources
 * can see, because the sources themselves are fine. These tests build the
 * artifact the same way the deployment does and check what is wrong without it.
 */
describe('the function bundle', () => {
  let source;

  before(async () => {
    await buildFunction();
    source = await readFile(BUNDLE_PATH, 'utf8');
  });

  it('leaves no relative import for Vercel to mis-emit', () => {
    const relativeImports = source.match(/(?:from|require\()\s*["']\.\.?\//g) ?? [];

    assert.deepEqual(relativeImports, [], 'the bundle must be self-contained');
  });

  it('keeps node_modules external, so nothing is inlined that cannot be', () => {
    const specifiers = new Set(source.match(/from\s*"([^"]+)"/g) ?? []);

    assert.ok(specifiers.has('from "cheerio"'), 'cheerio should be imported, not inlined');
    assert.ok(specifiers.has('from "@resvg/resvg-js"'), 'the rasteriser should be imported, not inlined');
    // Inlining CommonJS through ES modules is what produces the thrown
    // "Dynamic require of ... is not supported" at start-up.
    assert.ok(!source.includes('Dynamic require of'), 'no require shims should be left');
  });

  it('loads and answers both routes', async () => {
    const { handleRequest } = await import(BUNDLE_PATH);
    const notFound = async () => ({ status: 404, ok: false, url: 'https://www.geocaching.com/x', text: async () => '' });
    const deps = { fetchImpl: notFound, canRenderText: () => true };

    const card = await handleRequest(new Request('https://x.test/series/chapter/5/image.png'), deps);
    assert.equal(card.status, 200);
    assert.equal(card.headers.get('content-type'), 'image/png');

    const png = Buffer.from(await card.arrayBuffer());
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 750, 'width');

    const lookup = await handleRequest(new Request('https://x.test/api/cache/GCZZZZ1'), deps);
    assert.equal(lookup.status, 404);
    assert.equal((await lookup.json()).reason, 'not-found');
  });

  it('is what the function entry point imports', async () => {
    const entry = await readFile(fileURLToPath(new URL('../api/serve.ts', import.meta.url)), 'utf8');

    assert.match(entry, /from '\.\.\/build\/server\.mjs'/);
    assert.ok(!/from '\.\.\/src\//.test(entry), 'importing the sources is what breaks the deployment');
  });
});
