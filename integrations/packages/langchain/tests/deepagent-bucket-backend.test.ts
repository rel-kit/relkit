/** Exercises native deepagent bucket backend behavior through the integration owner, preserving the original assertions and scoped test fixtures. */

import { describe, expect, test } from "vitest";
import { adaptBackendProtocol } from "deepagents";
import {
  BucketOperationCancelledError,
  createBucketClient,
  type BucketProvider,
  type BucketPutOptions,
} from "@relkit/buckets";
import { createDeepAgentBucketBackend } from "../src/deepagent-bucket-backend.ts";
import { memoryBackend } from "./deepagent-bucket-backend.fixture.js";

describe("DeepAgents RELKIT bucket backend", () => {
  test(
    "implements V2 text, pagination, edit, search, and recursive delete semantics",
    caseImplementsV2TextPaginationEditSearchAnd,
  );

  test(
    "round-trips binary uploads and reports per-file failures",
    caseRoundTripsBinaryUploadsAndReportsPer,
  );

  test(
    "contains paths inside its bucket prefix and returns structured errors",
    caseContainsPathsInsideItsBucketPrefixAnd,
  );

  test(
    "propagates cancellation instead of converting it into file content",
    casePropagatesCancellationInsteadOfConvertingItInto,
  );
});

/** Verifies that implements V2 text, pagination, edit, search, and recursive delete semantics.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseImplementsV2TextPaginationEditSearchAnd() {
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
}

/** Verifies that round-trips binary uploads and reports per-file failures.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseRoundTripsBinaryUploadsAndReportsPer() {
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
}

/** Verifies that contains paths inside its bucket prefix and returns structured errors.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseContainsPathsInsideItsBucketPrefixAnd() {
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
}

/** Verifies that propagates cancellation instead of converting it into file content.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function casePropagatesCancellationInsteadOfConvertingItInto() {
  const controller = new AbortController();
  const provider: BucketProvider = {
    get: async (_key, context) => {
      await new Promise<void>((resolve) => {
        if (context?.signal.aborted) resolve();
        else context?.signal.addEventListener("abort", () => resolve(), { once: true });
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
}
