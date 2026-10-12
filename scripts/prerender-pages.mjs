#!/usr/bin/env node
/**
 * Writes a real HTML file for every page the app can show.
 *
 * Two reasons. Social crawlers do not run JavaScript, so a chapter link needs
 * its title, description and card image present in the file itself. And a
 * catch-all rewrite to /index.html would be the alternative for those paths —
 * which relies on static files winning over rewrites. Giving every static route
 * a file instead means the routing order never has to be relied on, and any
 * genuinely unknown path falls through to 404.html, which is the app again so
 * its own not-found page can render.
 *
 * Runs after `vite build`. What it can say about a chapter comes from the series
 * definition and the chapter's position in it: cache details are read from
 * coord.info while the request is served, so there are none to read here. The
 * card image behind each link preview carries the cache's own name.
 */
import { readdir, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_HEIGHT, CARD_WIDTH, escapeXml } from '../src/server/seriesCard.ts';
import { describeChapter } from '../src/lib/chapterCard.ts';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(projectRoot, 'dist');

/** Where the site is published; override for previews of a fork. */
const SITE_ORIGIN = (process.env.SITE_ORIGIN ?? 'https://geocaching.canonni.website').replace(/\/$/, '');

async function loadSeries() {
  const module = await import(new URL('../src/data/series.ts', import.meta.url));
  return module.SERIES;
}

function metaTags({ title, description, canonicalUrl, image, width, height }) {
  const tags = [
    ['name', 'description', description],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'Geocaching by CanonNi'],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:url', canonicalUrl],
  ];

  if (image) {
    tags.push(
      ['property', 'og:image', image],
      ['property', 'og:image:width', String(width)],
      ['property', 'og:image:height', String(height)],
      ['property', 'og:image:alt', title],
    );
  }

  tags.push(
    ['name', 'twitter:card', image ? 'summary_large_image' : 'summary'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
  );

  if (image) tags.push(['name', 'twitter:image', image]);

  return tags
    .map(([attribute, key, value]) => `    <meta ${attribute}="${escapeXml(key)}" content="${escapeXml(value)}" />`)
    .join('\n');
}

/** Fills in the built shell's metadata and returns the page to write. */
function buildPage(indexHtml, { title, description, path, image, width, height }) {
  const canonicalUrl = `${SITE_ORIGIN}${path}`;

  return indexHtml
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeXml(title)}</title>`)
    .replace(
      '</head>',
      `${metaTags({ title, description, canonicalUrl, image, width, height })}
    <link rel="canonical" href="${escapeXml(canonicalUrl)}" />
  </head>`,
    );
}

async function writePage(path, html) {
  const directory = resolve(distRoot, path.replace(/^\//, ''));
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'index.html'), html);
  return 1;
}

let index;
try {
  index = await readFile(resolve(distRoot, 'index.html'), 'utf8');
} catch {
  console.error('dist/index.html not found. Run this after `vite build` (it is the postbuild script).');
  process.exit(1);
}

const baseTitle = /<title>([\s\S]*?)<\/title>/.exec(index)?.[1] ?? 'Geocaching by CanonNi';
const seriesList = await loadSeries();

/**
 * Card image URL for a chapter. Stable rather than versioned: the image is
 * rendered on request from live cache data, so there is no build-time hash of it
 * to point at, and the CDN's own caching keeps repeat previews cheap.
 */
function cardImage(slug, number) {
  return {
    url: `${SITE_ORIGIN}/series/${slug}/${number}/image.png`,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  };
}

let written = 0;

// Static app routes, so none of them needs a rewrite.
const staticRoutes = [
  { path: '/about', title: `About — ${baseTitle}`, description: 'Why this site exists, and who it is for.' },
  { path: '/tools', title: `Tools — ${baseTitle}`, description: 'Small gadgets for geocaching puzzles and multis.' },
  { path: '/tools/multiply', title: `MultiPly — ${baseTitle}`, description: 'Reads a multi-cache description and solves its final coordinates.' },
  { path: '/series', title: `Series — ${baseTitle}`, description: 'Every series of geocaches, chapter by chapter.' },
];

for (const route of staticRoutes) {
  written += await writePage(route.path, buildPage(index, route));
}

/**
 * Every path the app can route to must be reachable on Vercel, which serves a
 * file per path or rewrites it into the function. A route added without either
 * would work in development and 404 once deployed, so stop the build instead of
 * finding out later. The wildcard is 404.html, which is the app again, so it can
 * render its own not-found page.
 */
const COVERED_ROUTES = new Map([
  ['/', 'index.html'],
  ['*', '404.html'],
  ['/series/:slug', 'a page per series'],
  ['/series/:slug/:number', 'a page per chapter'],
  ['/tools/multiply/:code', 'rewritten to index.html by vercel.json'],
  ...staticRoutes.map((route) => [route.path, 'a page of its own']),
]);

const app = await readFile(resolve(projectRoot, 'src/App.tsx'), 'utf8');
const uncovered = [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((path) => !COVERED_ROUTES.has(path));

if (uncovered.length > 0) {
  console.error(`No page for ${uncovered.join(', ')}. Add one here, or a rewrite in vercel.json.`);
  process.exit(1);
}

for (const series of seriesList) {
  const first = cardImage(series.slug, 1);

  written += await writePage(
    `/series/${series.slug}`,
    buildPage(index, {
      path: `/series/${series.slug}`,
      title: `${series.title} — ${baseTitle}`,
      description: series.summary,
      // The first chapter's card stands in as the series' preview image.
      image: first.url,
      width: first.width,
      height: first.height,
    }),
  );

  for (const [position, code] of series.codes.entries()) {
    const number = position + 1;
    const card = cardImage(series.slug, number);
    const copy = describeChapter({ series, number, total: series.codes.length, code });

    written += await writePage(
      `/series/${series.slug}/${number}`,
      buildPage(index, {
        path: `/series/${series.slug}/${number}`,
        title: copy.title,
        description: copy.description,
        image: card.url,
        width: card.width,
        height: card.height,
      }),
    );
  }
}

/**
 * A page for a chapter or series that no longer exists would serve stale
 * metadata, so remove any directory the current data does not account for.
 */
let pruned = 0;
const knownSlugs = new Set(seriesList.map((series) => series.slug));

for (const entry of await readdir(resolve(distRoot, 'series'), { withFileTypes: true }).catch(() => [])) {
  if (!entry.isDirectory()) continue;

  if (!knownSlugs.has(entry.name)) {
    await rm(resolve(distRoot, 'series', entry.name), { recursive: true, force: true });
    pruned += 1;
    continue;
  }

  const series = seriesList.find((candidate) => candidate.slug === entry.name);
  const validNumbers = new Set(series.codes.map((_, index) => String(index + 1)));
  const slugDirectory = resolve(distRoot, 'series', entry.name);

  for (const child of await readdir(slugDirectory, { withFileTypes: true })) {
    if (!child.isDirectory() || validNumbers.has(child.name)) continue;
    await rm(resolve(slugDirectory, child.name), { recursive: true, force: true });
    pruned += 1;
  }
}

/**
 * The wildcard route. Vercel answers an unknown path with 404.html, so it is the
 * built shell with its own title: the app boots and shows its not-found page
 * instead of a blank document.
 */
await writeFile(
  resolve(distRoot, '404.html'),
  index.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeXml(`Page not found — ${baseTitle}`)}</title>`,
  ),
);
written += 1;

console.log(`Pages: ${written} written, ${pruned} stale removed`);
if (written === 0) process.exit(1);