import { resolve, relative, sep } from "node:path";
import { realpath, stat } from "node:fs/promises";
import type { Context, Hono } from "hono";

export interface StaticFilesOptions {
  readonly root: string;
}

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

async function publicFile(root: string, path: string): Promise<Bun.BunFile | undefined> {
  const actualRoot = await realpath(root).catch(() => root);
  for (const candidate of [path, resolve(path, "index.html")]) {
    try {
      const actual = await realpath(candidate);
      const child = relative(actualRoot, actual);
      if (
        child === ".." ||
        child.startsWith(`..${sep}`) ||
        (await stat(actual)).isFile() === false
      ) {
        continue;
      }
      return Bun.file(actual);
    } catch {
      continue;
    }
  }
  return undefined;
}

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
