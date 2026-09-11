import { describe, expect, test } from "bun:test";
import { createBucketClient, type BucketProvider } from "@relkit/buckets";
import { createThreadBucketBackend } from "./src/deepagent-bucket-scope.ts";

describe("DeepAgents thread bucket scope", () => {
  test("isolates arbitrary caller-owned thread IDs without using them as paths", async () => {
    const bucket = memoryBucket();
    const hostile = createThreadBucketBackend(bucket, "research.agent", "../users/a/../../other");
    const other = createThreadBucketBackend(bucket, "research.agent", "other");

    expect(await hostile.write("/notes.md", "private")).toMatchObject({
      path: "/notes.md",
    });
    expect(await hostile.read("/notes.md")).toMatchObject({ content: "private" });
    expect(await other.read("/notes.md")).toEqual({ error: "File '/notes.md' not found" });

    const keys = await bucket.list();
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain("../users");
    expect(keys[0]).not.toContain("/other/");
  });

  test("requires the developer-supplied thread ID", () => {
    expect(() => createThreadBucketBackend(memoryBucket(), "agent", "")).toThrow(
      "requires threadId",
    );
  });
});

function memoryBucket() {
  const objects = new Map<string, Uint8Array>();
  const provider: BucketProvider = {
    put: async (key, bytes) => {
      objects.set(key, bytes.slice());
    },
    get: async (key) => objects.get(key)?.slice(),
    head: async (key) => {
      const bytes = objects.get(key);
      return bytes === undefined ? undefined : { etag: key, size: bytes.byteLength };
    },
    delete: async (key) => {
      objects.delete(key);
    },
    exists: async (key) => objects.has(key),
    list: async (prefix) =>
      [...objects.keys()].filter((key) => prefix === undefined || key.startsWith(prefix)).sort(),
  };
  return createBucketClient({ ownerId: "agent", bucketId: "workspace", source: provider });
}
