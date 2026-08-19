import { describe, expect, test } from "bun:test";
import { resourceView, resourceViews } from "./resources-model";

describe("inspector managed-resource projections", () => {
  test("joins safe bucket metadata and capability-gated operations", () => {
    const view = resourceView(
      "bucket",
      {
        kind: "bucket",
        id: "assets",
        profile: "default",
        visibility: "private",
        maxObjectBytes: 5_000_000,
        allowedContentTypes: ["image/*"],
      },
      {
        bucketId: "assets",
        capabilities: { signedReadUrl: false, signedWriteUrl: true },
        objects: 2,
        root: "/private/provider-state",
      },
    );

    expect(view).toMatchObject({
      id: "assets",
      profile: "default",
      descriptor: { visibility: "private", maxObjectBytes: 5_000_000 },
      stats: { objects: 2 },
    });
    expect(view.operations).toEqual([
      { name: "put", status: "declared" },
      { name: "get", status: "declared" },
      { name: "head", status: "declared" },
      { name: "delete", status: "declared" },
      { name: "exists", status: "declared" },
      { name: "list", status: "declared" },
      { name: "createReadUrl", status: "unsupported" },
      { name: "createWriteUrl", status: "supported" },
    ]);
    expect(JSON.stringify(view)).not.toContain("provider-state");
  });

  test("keeps cache schemas and counters while dropping raw key/value fields", () => {
    const views = resourceViews(
      "cache",
      [
        {
          kind: "cache",
          id: "prices",
          profile: "fast",
          key: { type: "object", properties: { sku: { type: "string" } } },
          value: { type: "number" },
          defaultTtlMs: 60_000,
          maxTtlMs: 300_000,
        },
      ],
      [
        {
          cacheId: "prices",
          capabilities: { increment: true, persistence: "restart-recovery" },
          entries: 3,
          key: "raw-sensitive-cache-key",
          value: "raw-sensitive-cache-value",
        },
      ],
    );

    expect(views[0]).toMatchObject({
      id: "prices",
      profile: "fast",
      descriptor: { defaultTtlMs: 60_000, maxTtlMs: 300_000 },
      stats: { entries: 3 },
      capabilities: ["increment", "persistence:restart-recovery"],
    });
    expect(views[0]?.operations.at(-1)).toEqual({ name: "increment", status: "supported" });
    expect(JSON.stringify(views)).not.toContain("raw-sensitive");
  });
});
