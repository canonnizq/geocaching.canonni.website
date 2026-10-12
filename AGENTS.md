# Instructions for agents

## Where the geocache data comes from

Nothing about a geocache is stored in this repository, and no build step touches
geocaching.com. The browser asks this site's own API, and the API reads
[coord.info](https://coord.info) while the request is being answered:

```
browser  →  /api/cache/GCBVHRE  →  function  →  coord.info
```

That indirection is not optional: coord.info redirects to geocaching.com, which
sends no CORS headers, so the browser can never read a cache page itself. Reading
it in a function also means a cache that is added, edited or archived upstream
appears without the site being rebuilt.

The chapter cards work the same way. `/series/<slug>/<number>/image.png` is drawn
on request from the series definition plus that cache's details, so it is never a
checked-in file. Everything is a cacheable GET with no cookies, no authentication
and no client-side JavaScript, so cards can be embedded anywhere:

```html
<a href="https://geocaching.canonni.website/series/chapter/5" target="_top">
  <img src="https://geocaching.canonni.website/series/chapter/5/image.png" width="750" alt="Series chapter 5">
</a>
```

### Caching

Reading upstream takes around two seconds at best, four seconds from a warm
instance and up to eleven when one is cold, so every answer is cached at the CDN
as well as inside the instance that produced it.

| Response | `Cache-Control` |
| --- | --- |
| A card, with cache details | `max-age=300, s-maxage=3600, stale-while-revalidate=86400` |
| A card whose cache could not be read | `max-age=60, s-maxage=300` — short, so the details fill in soon |
| A cache lookup | As a card, so an edit is visible within the hour |
| A code that does not exist / upstream trouble | `s-maxage=300` / `s-maxage=60` |

A card is never served `immutable`: its bytes depend on live data, so no URL can
promise they will not change. A versioned `?v=` URL scheme used to exist for that
reason and was removed with the build-time snapshot — do not reintroduce it
without a way to know the card's contents ahead of the request.

Each function instance also remembers a lookup for an hour (a minute, for a
failure) and shares one request between callers asking for the same code at the
same time, which is what keeps a series page from reading one code twice.

## How the site is put together

React 19, TypeScript, Vite. The retro theme shares its palette between the site
and the cards, so a card looks like a panel taken off the site.

- `src/data/series.ts` — the series, each a list of geocache codes. A chapter is a
  position in that list, so adding a code creates a chapter.
- `src/server/` — everything that needs a server: the coord.info scraper, the card
  composer and rasteriser, the lookup cache, and request handling.
- `api/serve.ts` — the one Vercel function. Every dynamic route is rewritten to it
  by `vercel.json`, and all the work is in `src/server/handlers.ts`, which the dev
  server and the tests call directly.
- `scripts/build-function.mjs` — bundles the server into `build/server.mjs` for
  the function to import. See the first gotcha below for why this exists; the test
  in `tests/function-bundle.test.mjs` guards it.
- `scripts/prerender-pages.mjs` — writes a real HTML file for every static route,
  with Open Graph tags, because crawlers do not run JavaScript. It also fails the
  build if `App.tsx` has a route with neither a page nor a rewrite, and writes
  `404.html` as the app again so an unknown path shows the site's own not-found
  page.
- `scripts/local-api.mjs` — a Vite plugin that serves the API and card routes in
  `npm run dev` and `npm run preview`, so what you see locally is what the
  function answers.

### Commands

```bash
npm run dev            # the site, with cards and cache lookups served live
npm run build          # type-check, bundle the function, build, write a page per route
npm run preview        # the built site, still with the API and cards served live
npm test               # node --test, no browser needed
npm run lint
```

`npm run build` is what Vercel runs.

## Gotchas, each of which cost a deployment

1. **Vercel compiles TypeScript files one at a time and does not rewrite import
   specifiers.** A function that imports the sources ends up asking for
   `./handlers.ts` beside a file emitted as `./handlers.js` and dies with
   `ERR_MODULE_NOT_FOUND` before any code runs — a failure no test of the sources
   can see. Hence the bundle: one plain JavaScript file, no relative imports.
2. **Do not inline `node_modules` into that bundle.** cheerio and its dependencies
   are CommonJS, and inlining them into an ES module leaves `require("buffer")`
   calls that esbuild can only turn into a thrown "Dynamic require is not
   supported", while `@resvg/resvg-js` carries a native binary that cannot be
   inlined at all. They stay external, and Vercel traces them from the bundle.
3. **`fetch` can fail while the body is being read**, not only while connecting,
   so the read needs its own try/catch: `fetchCacheDetails` promises never to
   throw, and a rejection becomes a 500 instead of the graceful failure the UI
   knows how to show.
4. **Check the deployed article, not just the sources.** `vercel build` writes the
   whole output — routes, static pages and the traced function — to
   `.vercel/output`; serving that directory is the only way to see what the
   deployment will actually do. Three bugs above were found that way and none of
   them by unit tests.

## Not verified from here

No deployment has been made, so what is tested is the build output rather than
the CDN: how a card's caching behaves behind Fastly, whether the runtime ships
fonts (the function detects a fontless runtime and answers with the SVG card
instead of a wordless PNG), and whether the platform honours the instance's
`arm64` or `x64` binary are all first-deploy questions.
