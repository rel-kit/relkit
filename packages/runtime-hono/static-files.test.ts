import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GENERATOR_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import type { RegistrationPlan } from "@zsys/graph";
import { createApp } from "./src/index.js";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "zsys-static-"));
  await mkdir(join(root, "docs"));
  await writeFile(join(root, "hello.txt"), "hello world");
  await writeFile(join(root, "docs", "index.html"), "<h1>Docs</h1>");
  await writeFile(join(root, ".secret"), "hidden");
});

afterAll(async () => rm(root, { recursive: true, force: true }));

describe("static files", () => {
  test("serves safe files, indexes, HEAD, ETags, and ranges after declared routes", async () => {
    const app = createApp({
      plan: routePlan(),
      manifest: {
        contractVersion: MANIFEST_VERSION,
        generatorVersion: GENERATOR_VERSION,
        graphHash: "sha256:static",
        functions: {},
        middleware: {},
        requestTransforms: {},
      },
      engine: { invoke: async () => ({ declared: true }) },
      mapInput: () => ({}),
      staticFiles: { root },
    });
    expect(await (await app.request("http://localhost/hello.txt")).json()).toEqual({
      declared: true,
    });
    expect(await (await app.request("http://localhost/docs/")).text()).toBe("<h1>Docs</h1>");
    const ranged = await app.request("http://localhost/docs/index.html", {
      headers: { range: "bytes=4-7" },
    });
    expect([ranged.status, await ranged.text(), ranged.headers.get("content-range")]).toEqual([
      206,
      "Docs",
      "bytes 4-7/13",
    ]);
    const head = await app.request("http://localhost/docs/index.html", { method: "HEAD" });
    expect([head.status, await head.text(), head.headers.get("content-length")]).toEqual([
      200,
      "",
      "13",
    ]);
    const cached = await app.request("http://localhost/docs/index.html", {
      headers: { "if-none-match": head.headers.get("etag")! },
    });
    expect(cached.status).toBe(304);
    expect((await app.request("http://localhost/.secret")).status).toBe(404);
    expect((await app.request("http://localhost/%2e%2e/package.json")).status).toBe(404);
  });
});

function routePlan(): RegistrationPlan {
  return {
    graphHash: "sha256:static",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "hello.route",
        source: { file: "src/routes/hello.ts", line: 1, column: 1 },
        triggerType: "http",
        targetFunctionId: "hello",
        config: {
          method: "GET",
          path: "/hello.txt",
          request: { kind: "input" },
          responses: [],
          middleware: [],
          transforms: [],
        },
      },
    ],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
    middlewares: [],
  };
}
