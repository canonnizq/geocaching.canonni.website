/**
 * Types for the bundle beside this file, which `npm run build:function` writes
 * and the repository does not keep. Only the function entry point in api/ uses
 * it, so this is the whole surface it needs.
 */
export declare function handleRequest(request: Request): Promise<Response>;
