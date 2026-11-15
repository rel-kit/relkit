/**
 * The development front's block of rich inspection paths: the Inspector reaches them over its
 * bridge, so the public front answers them the way the application answers an unknown path.
 */
import { notFoundResponse } from "./proxy-target.js";

/**
 * Answers a rich inspection path on the public front, or leaves the request to the application.
 * @param request - Request as the front forwards it (see `publicRequest`), so the path judged here
 * is the path the worker would serve.
 * @returns The front's 404 Problem for a private inspection path; otherwise nothing.
 */
export function blockInspectionPath(request: Request): Promise<Response> | undefined {
  if (!isPrivateInspectionPath(new URL(request.url).pathname)) return undefined;
  return Promise.resolve(notFoundResponse());
}

/** Keeps core readiness, identity, jobs RPC and selected public transports independent.
 * @param path - Pathname of the request. @returns Whether the path is a private inspection path. */
function isPrivateInspectionPath(path: string): boolean {
  if (path === "/_relkit/v1/graph") return false;
  if (/^\/_relkit\/v1\/jobs(?:\/|$)/.test(path)) return false;
  if (/^\/_relkit\/v1\/agents\/[^/]+\/ag-ui$/.test(path)) return false;
  return (
    path === "/_relkit/v1" ||
    /^\/_relkit\/v1\/(?:runtime|graph|source|env|diagnostics|requests|logs|traces|stream|storage|actions|jobs|descriptors|routes|middlewares|functions|events|buckets|cache|tools|agents|channels|errors|services|providers)(?:\/|$)/.test(
      path,
    )
  );
}
