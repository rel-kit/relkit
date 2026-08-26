import { describe, expect, test } from "bun:test";
import { API_BASE_PATH } from "@zsys/contracts";
import { Hono } from "hono";
import { installInspectorEndpoints } from "./src/index.ts";

const identity = { generationId: "generation-one", graphHash: "sha256:one" };

describe("inspector resource explorers", () => {
  test("pages bucket metadata and safely classifies bounded previews", async () => {
    const app = application();
    const page = await app.request(
      `${API_BASE_PATH}/runtime/buckets/assets/objects?prefix=docs&limit=1`,
    );
    expect(await page.json()).toMatchObject({
      supported: true,
      items: [{ key: "docs/readme.txt" }],
      nextCursor: "1",
    });

    const text = await app.request(
      `${API_BASE_PATH}/runtime/buckets/assets/objects/preview?key=docs%2Freadme.txt`,
    );
    expect(await text.json()).toMatchObject({ kind: "text", content: "hello", truncated: false });
    expect(text.headers.get("content-security-policy")).toBe("sandbox");

    const html = await app.request(
      `${API_BASE_PATH}/runtime/buckets/assets/objects/preview?key=unsafe.html`,
    );
    expect(await html.json()).toMatchObject({ kind: "metadata-only" });
  });

  test("scans cache keys, returns TTL metadata, and handles unsupported providers", async () => {
    const app = application();
    const keys = await app.request(
      `${API_BASE_PATH}/runtime/cache/prices/keys?search=price&limit=50`,
    );
    expect(await keys.json()).toMatchObject({
      supported: true,
      items: [{ key: '"price:1"', type: "string", ttlMs: 500 }],
    });
    const value = await app.request(
      `${API_BASE_PATH}/runtime/cache/prices/keys/value?key=%22price%3A1%22`,
    );
    expect(await value.json()).toMatchObject({ value: { cents: 100 }, truncated: false });
    const unsupported = await app.request(`${API_BASE_PATH}/runtime/cache/custom/keys`);
    expect(await unsupported.json()).toMatchObject({ supported: false, reason: "unsupported" });
  });

  test("rejects invalid limits and missing values", async () => {
    const app = application();
    expect(
      (await app.request(`${API_BASE_PATH}/runtime/buckets/assets/objects?limit=201`)).status,
    ).toBe(400);
    expect(
      (await app.request(`${API_BASE_PATH}/runtime/cache/prices/keys/value?key=missing`)).status,
    ).toBe(404);
  });
});

function application(): Hono {
  const app = new Hono();
  installInspectorEndpoints(app, {
    maxPreviewBytes: 10,
    activeGeneration: {
      ...identity,
      resources: {
        buckets: {
          supports: (id) => id === "assets",
          list: () => ({
            items: [{ key: "docs/readme.txt", metadata: { contentType: "text/plain" } }],
            nextCursor: "1",
          }),
          preview: ({ key }) =>
            key === "missing"
              ? undefined
              : {
                  bytes: new TextEncoder().encode(key === "unsafe.html" ? "<script>" : "hello"),
                  metadata: { contentType: key === "unsafe.html" ? "text/html" : "text/plain" },
                  totalBytes: key === "unsafe.html" ? 8 : 5,
                },
        },
        cache: {
          supports: (id) => id === "prices",
          scan: () => ({ items: [{ key: '"price:1"', type: "string", ttlMs: 500, bytes: 13 }] }),
          value: ({ key }) =>
            key === '"price:1"'
              ? {
                  key,
                  type: "string",
                  ttlMs: 500,
                  bytes: 13,
                  value: { cents: 100 },
                  truncated: false,
                }
              : undefined,
        },
      },
    },
  });
  return app;
}
