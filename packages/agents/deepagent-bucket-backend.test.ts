import { describe, expect, test } from "bun:test";
import { adaptBackendProtocol } from "deepagents";
import {
  BucketOperationCancelledError,
  createBucketClient,
  type BucketProvider,
  type BucketPutOptions,
} from "@relkit/buckets";
import { createDeepAgentBucketBackend } from "./src/deepagent-bucket-backend.ts";

interface StoredObject {
  readonly bytes: Uint8Array;
  readonly options?: BucketPutOptions;
}

function memoryBackend(signal?: () => AbortSignal) {
  const objects = new Map<string, StoredObject>();
  const provider: BucketProvider = {
    put: async (key, bytes, options) => {
      objects.set(key, { bytes: bytes.slice(), ...(options === undefined ? {} : { options }) });
    },
    get: async (key) => objects.get(key)?.bytes.slice(),
    head: async (key) => {
      const object = objects.get(key);
      return object === undefined
        ? undefined
        : {
            etag: key,
            size: object.bytes.byteLength,
            contentType: object.options?.contentType,
            metadata: object.options?.metadata,
          };
    },
    delete: async (key) => {
      objects.delete(key);
    },
    exists: async (key) => objects.has(key),
    list: async (prefix) =>
      [...objects.keys()].filter((key) => prefix === undefined || key.startsWith(prefix)).sort(),
  };
  const bucket = createBucketClient({
    ownerId: "assistant",
    bucketId: "workspace",
    source: provider,
    ...(signal === undefined ? {} : { signal }),
  });
  return { backend: createDeepAgentBucketBackend(bucket, { prefix: "threads/demo" }), objects };
}

describe("DeepAgents RELKIT bucket backend", () => {
  test("implements V2 text, pagination, edit, search, and recursive delete semantics", async () => {
    const { backend, objects } = memoryBackend();
    expect(await backend.write("/notes/a.md", "alpha\nbeta\nalpha")).toMatchObject({
      path: "/notes/a.md",
      filesUpdate: null,
    });
    await backend.write("/notes/nested/b.md", "beta");

    expect(await backend.read("/notes/a.md", 1, 1)).toEqual({
      content: "beta",
      mimeType: "text/markdown",
      totalLines: 3,
      startLine: 2,
      endLine: 2,
      nextOffset: 2,
    });
    expect(await backend.ls("/notes")).toMatchObject({
      files: [
        { path: "/notes/a.md", is_dir: false, size: 16 },
        { path: "/notes/nested/", is_dir: true },
      ],
    });
    expect(await backend.glob("nested/*.md", "/notes")).toMatchObject({
      files: [{ path: "/notes/nested/b.md" }],
    });
    expect(await backend.grep("alpha", "/", "*.md", 1)).toEqual({
      matches: [{ path: "/notes/a.md", line: 1, text: "alpha" }],
      truncated: true,
    });

    expect(await backend.edit("/notes/a.md", "alpha", "done")).toMatchObject({
      error: expect.any(String),
    });
    expect(await backend.edit("/notes/a.md", "alpha", "done", true)).toMatchObject({
      path: "/notes/a.md",
      occurrences: 2,
    });
    await backend.write("/notes", "object sharing the directory prefix");
    expect(await backend.delete?.("/notes")).toEqual({
      path: "/notes",
      filesUpdate: null,
    });
    expect(objects.size).toBe(0);
  });

  test("round-trips binary uploads and reports per-file failures", async () => {
    const { backend } = memoryBackend();
    const nativeBackend = adaptBackendProtocol(backend);
    expect(
      await backend.uploadFiles?.([
        ["/images/a.png", new Uint8Array([1, 2, 3])],
        ["../escape", new Uint8Array([4])],
      ]),
    ).toEqual([
      { path: "/images/a.png", error: null },
      { path: "../escape", error: "invalid_path" },
    ]);
    expect(await backend.read("/images/a.png")).toEqual({
      content: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
    });
    expect(await backend.downloadFiles?.(["/images/a.png", "/missing"])).toEqual([
      { path: "/images/a.png", content: new Uint8Array([1, 2, 3]), error: null },
      { path: "/missing", content: null, error: "file_not_found" },
    ]);
    expect(await nativeBackend.ls("/images")).toMatchObject({
      files: [{ path: "/images/a.png" }],
    });
  });

  test("contains paths inside its bucket prefix and returns structured errors", async () => {
    const { backend, objects } = memoryBackend();
    for (const path of ["../escape", "/a/../../escape", "C:/escape", "~/.secret", "/null\0byte"]) {
      expect(await backend.write(path, "nope")).toMatchObject({ error: expect.any(String) });
    }
    expect(await backend.read("/missing")).toEqual({ error: "File '/missing' not found" });
    expect(objects.size).toBe(0);
    const cacheClient = {
      get: async () => undefined,
      set: async () => undefined,
      delete: async () => undefined,
    };
    expect(() => createDeepAgentBucketBackend(cacheClient as never)).toThrow(
      "requires a RELKIT BucketClient",
    );
  });

  test("propagates cancellation instead of converting it into file content", async () => {
    const controller = new AbortController();
    const provider: BucketProvider = {
      get: async (_key, context) => {
        await new Promise<void>((resolve) => {
          if (context?.signal.aborted) resolve();
          else context?.signal.addEventListener("abort", resolve, { once: true });
        });
        return undefined;
      },
      head: async () => undefined,
      put: async () => undefined,
      delete: async () => undefined,
      exists: async () => false,
      list: async () => [],
    };
    const bucket = createBucketClient({
      ownerId: "assistant",
      bucketId: "workspace",
      source: provider,
      signal: () => controller.signal,
    });
    const pending = createDeepAgentBucketBackend(bucket).read("/blocked");
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(BucketOperationCancelledError);
  });
});
