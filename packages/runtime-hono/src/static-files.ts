import { Effect, Layer } from "effect";
import type { Context, Hono } from "hono";
import { relative, resolve, sep } from "node:path";
import { runHttp } from "./http-effect.js";
import { StaticFiles, StaticFilesLive, StaticFileSystemLive } from "./static-file-service.js";
import type { StaticFilesOptions } from "./static-files.types.js";
export type { StaticFilesOptions } from "./static-files.types.js";

/** Registers declared assets while retaining route precedence and confinement checks.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing; the requested update is applied to the owned state.
 */
export function installStaticFiles(app: Hono, options: StaticFilesOptions | undefined): void {
  if (options === undefined) return;
  const root = resolve(options.root);
  app.on(["GET", "HEAD"], "*", async (context, next) => {
    const path = safePath(root, new URL(context.req.url).pathname);
    if (path === undefined) return context.notFound();
    const file = await publicFile(root, path);
    if (file === undefined) return next();
    return fileResponse(context, file);
  });
}

/** Resolves a URL path beneath the configured public root and rejects traversal.
 * @param root - Configured filesystem root that bounds served files.
 * @param pathname - Decoded URL pathname resolved under the public root.
 * @returns The confined absolute path, or undefined for malformed, hidden or traversing paths.
 */
function safePath(root: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const segments = decoded.split("/").filter(Boolean);
  if (segments.some((segment) => segment === ".." || segment.startsWith("."))) return undefined;
  const path = resolve(root, ...segments);
  const child = relative(root, path);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !child.startsWith(sep))
    ? path
    : undefined;
}

/** Finds an existing confined file through the static-file service.
 * @param root - Configured filesystem root that bounds served files.
 * @param path - Ordered validation path or confined resource path.
 * @returns The existing confined Bun file, or undefined when no public file matches.
 */
async function publicFile(root: string, path: string): Promise<Bun.BunFile | undefined> {
  return runHttp(
    Effect.gen(function* () {
      return yield* (yield* StaticFiles).find(root, path);
    }).pipe(Effect.provide(StaticFilesLive.pipe(Layer.provide(StaticFileSystemLive)))),
  );
}

/** Creates a range-aware file response with the established cache and content headers.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param file - Confined native file selected by the static-file service.
 * @returns A full, partial, not-modified or unsatisfiable-range response for the request.
 */
async function fileResponse(context: Context, file: Bun.BunFile): Promise<Response> {
  const etag = `"${file.size.toString(16)}-${file.lastModified.toString(16)}"`;
  const headers = new Headers({
    "accept-ranges": "bytes",
    "content-type": file.type || "application/octet-stream",
    etag,
  });
  if (context.req.header("if-none-match") === etag)
    return new Response(null, { status: 304, headers });
  const range = parseRange(context.req.header("range"), file.size);
  if (range === "invalid") {
    headers.set("content-range", `bytes */${file.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range !== undefined) {
    headers.set("content-range", `bytes ${range.start}-${range.end}/${file.size}`);
    headers.set("content-length", String(range.end - range.start + 1));
    const body =
      context.req.method === "HEAD"
        ? null
        : await file.slice(range.start, range.end + 1).arrayBuffer();
    return new Response(body, { status: 206, headers });
  }
  headers.set("content-length", String(file.size));
  return new Response(context.req.method === "HEAD" ? null : file, { headers });
}

/** Parses one satisfiable byte range within the known file size.
 * @param header - Raw header value parsed without trusting malformed input.
 * @param size - Known total byte length of the selected file.
 * @returns Inclusive byte offsets, undefined for no range, or "invalid" for an unsatisfiable range.
 */
function parseRange(
  header: string | undefined,
  size: number,
): { readonly start: number; readonly end: number } | "invalid" | undefined {
  if (header === undefined) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (match === null || size === 0) return "invalid";
  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  if (startText === "" && endText === "") return "invalid";
  const suffix = endText === "" ? undefined : Number(endText);
  const start = startText === "" ? Math.max(0, size - (suffix ?? 0)) : Number(startText);
  const end = startText === "" ? size - 1 : endText === "" ? size - 1 : Number(endText);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  ) {
    return "invalid";
  }
  return { start, end: Math.min(end, size - 1) };
}
