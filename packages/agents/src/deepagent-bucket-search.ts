import type { FileInfo, GlobResult, GrepResult, LsResult } from "deepagents";
import {
  errorMessage,
  filePath,
  infoFor,
  isControlFailure,
  isTextMimeType,
  readFileData,
  scopedKeys,
  virtualPath,
  type DeepAgentBucketContext,
} from "./deepagent-bucket-files.js";

export async function listDirectory(
  context: DeepAgentBucketContext,
  path: string,
): Promise<LsResult> {
  try {
    const directory = virtualPath(path, true);
    const keyPrefix = directory === "/" ? `${context.prefix}/` : `${context.prefix}${directory}`;
    const keys = [...(await context.bucket.list(keyPrefix))].sort();
    const directories = new Set<string>();
    const direct: string[] = [];
    for (const key of keys) {
      const relative = key.slice(keyPrefix.length);
      const separator = relative.indexOf("/");
      if (separator >= 0) directories.add(relative.slice(0, separator));
      else if (relative !== "") direct.push(key);
    }
    const files = (await Promise.all(direct.map((key) => infoFor(context, key)))).filter(
      (entry): entry is FileInfo => entry !== undefined,
    );
    for (const name of directories) {
      files.push({ path: `${directory}${name}/`, is_dir: true, size: 0, modified_at: "" });
    }
    return { files: files.sort((left, right) => left.path.localeCompare(right.path)) };
  } catch (cause) {
    if (isControlFailure(cause)) throw cause;
    return { error: errorMessage(cause) };
  }
}

export async function globFiles(
  context: DeepAgentBucketContext,
  pattern: string,
  path = "/",
): Promise<GlobResult> {
  try {
    const glob = compileGlob(pattern);
    const base = virtualPath(path, true);
    const keys = await scopedKeys(context, path);
    const infos: FileInfo[] = [];
    for (const key of keys) {
      const absolute = filePath(context, key);
      const relative = absolute.startsWith(base)
        ? absolute.slice(base.length)
        : absolute.split("/").at(-1)!;
      if (!relative || !glob.match(relative)) continue;
      const info = await infoFor(context, key);
      if (info !== undefined) infos.push(info);
    }
    infos.sort(
      (left, right) =>
        (right.modified_at ?? "").localeCompare(left.modified_at ?? "") ||
        left.path.localeCompare(right.path),
    );
    return { files: infos };
  } catch (cause) {
    if (isControlFailure(cause)) throw cause;
    return { error: errorMessage(cause) };
  }
}

export async function grepFiles(
  context: DeepAgentBucketContext,
  pattern: string,
  path: string | null = null,
  globPattern: string | null = null,
  maxCount: number | null = null,
): Promise<GrepResult> {
  try {
    if (typeof pattern !== "string") throw new TypeError("Grep pattern must be a string");
    const glob = globPattern === null ? undefined : compileGlob(globPattern);
    const keys = await scopedKeys(context, path);
    const cap =
      maxCount === null || !Number.isFinite(maxCount)
        ? Number.POSITIVE_INFINITY
        : Math.max(0, Math.floor(maxCount));
    const matches: NonNullable<GrepResult["matches"]> = [];
    for (const key of keys) {
      const absolute = filePath(context, key);
      const name = absolute.split("/").at(-1)!;
      if (glob !== undefined && !glob.match(name)) continue;
      const data = await readFileData(context, absolute);
      if (
        data === undefined ||
        !isTextMimeType(data.mimeType) ||
        typeof data.content !== "string"
      ) {
        continue;
      }
      for (const [index, text] of data.content.split("\n").entries()) {
        if (!text.includes(pattern)) continue;
        matches.push({ path: absolute, line: index + 1, text });
        if (matches.length > cap) return { matches: matches.slice(0, cap), truncated: true };
      }
    }
    return { matches };
  } catch (cause) {
    if (isControlFailure(cause)) throw cause;
    return { error: errorMessage(cause) };
  }
}

function compileGlob(pattern: string): Bun.Glob {
  if (
    typeof pattern !== "string" ||
    pattern.trim() === "" ||
    pattern.includes("\0") ||
    pattern.replaceAll("\\", "/").split("/").includes("..")
  ) {
    throw new TypeError("Glob pattern is invalid");
  }
  return new Bun.Glob(pattern.startsWith("/") ? pattern.slice(1) : pattern);
}
