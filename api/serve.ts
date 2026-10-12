/**
 * The site's one serverless function.
 *
 * Vercel finds a function by file name, so every dynamic route is rewritten here
 * by vercel.json: chapter cards and cache lookups both land on this file and are
 * told apart by the query it was rewritten with.
 *
 * What it imports is a bundle built by `npm run build:function`, not the sources:
 * Vercel compiles each TypeScript file separately without rewriting import
 * specifiers, so importing the sources here would leave the deployed function
 * asking for "./handlers.ts" beside a file emitted as "./handlers.js". The bundle
 * is one plain JavaScript file, which Vercel carries over untouched.
 */
import { handleRequest } from '../build/server.mjs';

export default {
  fetch(request: Request): Promise<Response> {
    return handleRequest(request);
  },
};
