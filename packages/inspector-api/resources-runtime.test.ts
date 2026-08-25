import { describe, expect, test } from "bun:test";
import { API_BASE_PATH } from "@zsys/contracts";
import { Hono } from "hono";
import { installInspectorEndpoints } from "./src/index.ts";

describe("inspector managed-resource runtime boundary", () => {
  test("projects capability/profile/counter metadata without provider storage", async () => {
    const app = new Hono();
    installInspectorEndpoints(app, {
      activeGeneration: {
        generationId: "generation-one",
        graphHash: "sha256:one",
        graph: {
          contractVersion: 3,
          nodes: [
            {
              kind: "bucket",
              id: "assets",
              profile: "default",
              visibility: "private",
              maxObjectBytes: 5_000_000,
              allowedContentTypes: ["image/*"],
            },
            {
              kind: "cache",
              id: "prices",
              profile: "fast",
              key: { type: "object" },
              value: { type: "number" },
              defaultTtlMs: 60_000,
              maxTtlMs: 300_000,
            },
          ],
          edges: [],
        },
        runtime: {
          buckets: {
            list: async () => [
              {
                bucketId: "assets",
                profile: "default",
                capabilities: { signedReadUrl: false, signedWriteUrl: true },
                objects: 2,
                root: "/private/provider-state",
                key: "raw-bucket-key",
              },
            ],
          },
          cache: {
            list: async () => [
              {
                cacheId: "prices",
                profile: "fast",
                capabilities: { increment: true, persistence: "restart-recovery" },
                entries: 3,
                key: "raw-cache-key",
                value: "raw-cache-value",
                stateRoot: "/private/provider-state",
              },
            ],
          },
        },
      },
    });

    const buckets = await app.request(`${API_BASE_PATH}/runtime/buckets`);
    const cache = await app.request(`${API_BASE_PATH}/runtime/cache`);
    const bucketBody = await buckets.json();
    const cacheBody = await cache.json();

    expect(buckets.status).toBe(200);
    expect(cache.status).toBe(200);
    expect(bucketBody.items).toMatchObject([
      {
        bucketId: "assets",
        profile: "default",
        capabilities: { signedReadUrl: false, signedWriteUrl: true },
        objects: 2,
      },
    ]);
    expect(cacheBody.items).toMatchObject([
      {
        cacheId: "prices",
        profile: "fast",
        capabilities: { increment: true, persistence: "restart-recovery" },
        entries: 3,
      },
    ]);
    const payload = JSON.stringify({ bucketBody, cacheBody });
    expect(payload).not.toContain("provider-state");
    expect(payload).not.toContain("raw-bucket-key");
    expect(payload).not.toContain("raw-cache-key");
    expect(payload).not.toContain("raw-cache-value");
  });
});
