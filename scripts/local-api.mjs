/**
 * Serves the deployed dynamic routes from the dev and preview servers.
 *
 * Cards and cache lookups are produced by the same code Vercel runs
 * (src/server/handlers.ts), so `npm run dev` and `npm run preview` show real
 * cards built from cache details read live — nothing is generated ahead of time,
 * and what you see locally is what the deployed function answers.
 */
import { handleRequest } from '../src/server/handlers.ts';

/** The URLs vercel.json rewrites to the function, plus the API the app calls. */
const DYNAMIC_PATHS = [/^\/api\/[^/]+/, /^\/series\/[^/]+\/\d+\/image\.(png|svg)$/];

function isDynamic(pathname) {
  return DYNAMIC_PATHS.some((pattern) => pattern.test(pathname));
}

/** Node's request, presented to the handler as the web Request it expects. */
function toRequest(incoming) {
  const url = new URL(incoming.url ?? '/', `http://${incoming.headers.host ?? 'localhost'}`);

  return new Request(url, { method: incoming.method, headers: incoming.headers });
}

async function answer(incoming, outgoing) {
  const response = await handleRequest(toRequest(incoming));

  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) outgoing.setHeader(name, value);

  // Only GET and HEAD reach the handler, so there is never a request body to drain.
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

export function localApi() {
  const middleware = (incoming, outgoing, next) => {
    const pathname = new URL(incoming.url ?? '/', 'http://localhost').pathname;
    if (!isDynamic(pathname)) return next();

    answer(incoming, outgoing).catch(next);
  };

  return {
    name: 'canonni:local-api',
    configureServer: (server) => {
      server.middlewares.use(middleware);
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(middleware);
    },
  };
}
