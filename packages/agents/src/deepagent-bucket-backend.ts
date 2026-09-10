import type {
  BackendProtocolV2,
  DeleteResult,
  EditResult,
  FileDownloadResponse,
  FileUploadResponse,
  ReadRawResult,
  ReadResult,
  WriteResult,
} from "deepagents";
import {
  bucketKey,
  createBucketContext,
  errorMessage,
  isControlFailure,
  isTextMimeType,
  normalizedPage,
  putFileData,
  readFileData,
  scopedKeys,
  virtualPath,
  type DeepAgentBucketClient,
} from "./deepagent-bucket-files.js";
import { globFiles, grepFiles, listDirectory } from "./deepagent-bucket-search.js";

export interface DeepAgentBucketBackendOptions {
  readonly prefix?: string;
}

/** Internal bridge used when a DeepAgent declares a RELKIT bucket descriptor. */
export function createDeepAgentBucketBackend(
  bucket: DeepAgentBucketClient,
  options: DeepAgentBucketBackendOptions = {},
): BackendProtocolV2 {
  const context = createBucketContext(bucket, options.prefix);
  const readRaw = async (path: string): Promise<ReadRawResult> =>
    result(async () => {
      const data = await readFileData(context, path);
      return data === undefined ? { error: `File '${path}' not found` } : { data };
    });
  const write = async (path: string, content: string): Promise<WriteResult> =>
    result(async () => {
      if (typeof content !== "string") throw new TypeError("File content must be a string");
      const normalized = virtualPath(path);
      await putFileData(context, normalized, content);
      return { path: normalized, filesUpdate: null };
    });

  return Object.freeze({
    ls: (path: string) => listDirectory(context, path),
    read: (path: string, offset?: number, limit?: number) => read(context, path, offset, limit),
    readRaw,
    write,
    edit: (path: string, oldText: string, newText: string, replaceAll = false) =>
      edit(context, path, oldText, newText, replaceAll),
    grep: (pattern: string, path?: string | null, glob?: string | null, maxCount?: number | null) =>
      grepFiles(context, pattern, path, glob, maxCount),
    glob: (pattern: string, path?: string) => globFiles(context, pattern, path),
    delete: (path: string) => remove(context, path),
    uploadFiles: (files: Array<[string, Uint8Array]>) => upload(context, files),
    downloadFiles: (paths: string[]) => download(context, paths),
  });
}

async function read(
  context: ReturnType<typeof createBucketContext>,
  path: string,
  offset = 0,
  limit = 500,
): Promise<ReadResult> {
  return result(async () => {
    const data = await readFileData(context, path);
    if (data === undefined) return { error: `File '${path}' not found` };
    if (!isTextMimeType(data.mimeType)) return { content: data.content, mimeType: data.mimeType };
    if (typeof data.content !== "string") {
      return { error: `File '${path}' has binary content but text MIME type` };
    }
    const page = normalizedPage(offset, limit);
    const lines = data.content.split("\n");
    const totalLines = lines.at(-1) === "" ? lines.length - 1 : lines.length;
    const selected = lines.slice(page.offset, page.offset + page.limit);
    if (selected.length === 0 || page.offset >= totalLines || page.limit === 0) {
      return { content: selected.join("\n"), mimeType: data.mimeType };
    }
    const endLine = Math.min(page.offset + selected.length, totalLines);
    return {
      content: selected.join("\n"),
      mimeType: data.mimeType,
      totalLines,
      startLine: page.offset + 1,
      endLine,
      ...(endLine < totalLines ? { nextOffset: endLine } : {}),
    };
  });
}

async function edit(
  context: ReturnType<typeof createBucketContext>,
  path: string,
  oldText: string,
  newText: string,
  replaceAll: boolean,
): Promise<EditResult> {
  return result(async () => {
    const normalized = virtualPath(path);
    const data = await readFileData(context, normalized);
    if (data === undefined) return { error: `Error: File '${normalized}' not found` };
    if (typeof data.content !== "string") return { error: `Error: File '${normalized}' is binary` };
    if (oldText === "" && data.content !== "") {
      return { error: "Error: oldString cannot be empty when file has content" };
    }
    const occurrences = oldText === "" ? 0 : data.content.split(oldText).length - 1;
    if (oldText !== "" && occurrences === 0) {
      return { error: `Error: String not found in file: '${oldText}'` };
    }
    if (occurrences > 1 && !replaceAll) {
      return { error: `Error: String '${oldText}' has multiple occurrences (${occurrences})` };
    }
    const content = oldText === "" ? newText : data.content.split(oldText).join(newText);
    await putFileData(context, normalized, content);
    return { path: normalized, filesUpdate: null, occurrences };
  });
}

async function remove(
  context: ReturnType<typeof createBucketContext>,
  path: string,
): Promise<DeleteResult> {
  return result(async () => {
    const normalized = path === "/" ? "/" : virtualPath(path);
    const keys =
      normalized === "/"
        ? await context.bucket.list(`${context.prefix}/`)
        : await deletionKeys(context, normalized);
    if (keys.length === 0) return { error: `Error: File '${normalized}' not found` };
    await Promise.all(keys.map((key) => context.bucket.delete(key)));
    return { path: normalized, filesUpdate: null };
  });
}

async function deletionKeys(
  context: ReturnType<typeof createBucketContext>,
  path: string,
): Promise<readonly string[]> {
  const exact = bucketKey(context, path);
  const [exists, nested] = await Promise.all([
    context.bucket.exists(exact),
    context.bucket.list(`${exact}/`),
  ]);
  return exists ? [exact, ...nested] : nested;
}

async function upload(
  context: ReturnType<typeof createBucketContext>,
  files: Array<[string, Uint8Array]>,
): Promise<FileUploadResponse[]> {
  const responses: FileUploadResponse[] = [];
  for (const [path, content] of files) {
    try {
      if (!(content instanceof Uint8Array)) throw new TypeError("File content must be bytes");
      const normalized = virtualPath(path);
      await putFileData(context, normalized, content);
      responses.push({ path: normalized, error: null });
    } catch (cause) {
      if (isControlFailure(cause)) throw cause;
      responses.push({ path, error: "invalid_path" });
    }
  }
  return responses;
}

async function download(
  context: ReturnType<typeof createBucketContext>,
  paths: string[],
): Promise<FileDownloadResponse[]> {
  const responses: FileDownloadResponse[] = [];
  for (const path of paths) {
    try {
      const content = await context.bucket.get(bucketKey(context, path));
      responses.push(
        content === undefined
          ? { path, content: null, error: "file_not_found" }
          : { path: virtualPath(path), content, error: null },
      );
    } catch (cause) {
      if (isControlFailure(cause)) throw cause;
      responses.push({ path, content: null, error: "invalid_path" });
    }
  }
  return responses;
}

async function result<Result>(work: () => Promise<Result>): Promise<Result> {
  try {
    return await work();
  } catch (cause) {
    if (isControlFailure(cause)) throw cause;
    return { error: errorMessage(cause) } as Result;
  }
}
