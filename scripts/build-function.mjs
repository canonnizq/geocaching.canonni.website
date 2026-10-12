#!/usr/bin/env node
/**
 * Bundles the server into the one file the Vercel function runs.
 *
 * Vercel compiles each TypeScript file it finds on its own and does not rewrite
 * import specifiers, so a graph of modules that import each other as
 * "./thing.ts" arrives in the function directory with imports pointing at
 * "./thing.ts" — while the files beside them were emitted as "./thing.js". The
 * function then cannot start at all: every request fails with
 * ERR_MODULE_NOT_FOUND before any of this code runs.
 *
 * Bundling here means the function is one plain JavaScript file with no relative
 * imports left for Vercel to get wrong, and the four-line entry point in api/ is
 * the only TypeScript it has to compile.
 *
 * Nothing from node_modules is inlined. cheerio and its dependencies are
 * CommonJS, and inlining those into an ES module leaves `require("buffer")` calls
 * that esbuild can only turn into a thrown "Dynamic require is not supported",
 * while @resvg/resvg-js carries a native binary that cannot be inlined at all.
 * Leaving them external means Node loads them from node_modules, which Vercel
 * traces from this bundle's imports. What is left here is this site's own code.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the bundle the function imports is written. */
export const BUNDLE_PATH = resolve(projectRoot, 'build/server.mjs');

export function buildFunction(outfile = BUNDLE_PATH) {
  return build({
    entryPoints: [resolve(projectRoot, 'src/server/handlers.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    // Every bare import stays a bare import, for Node to resolve at run time.
    packages: 'external',
    logLevel: 'warning',
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await mkdir(dirname(BUNDLE_PATH), { recursive: true });
  await buildFunction();
  console.log(`Function bundle: ${relative(process.cwd(), BUNDLE_PATH)}`);
}
