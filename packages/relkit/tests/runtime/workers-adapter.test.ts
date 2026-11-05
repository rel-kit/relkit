/**
 * The Workers adapter has no listener, filesystem, child processes or module registry, and hashes
 * with `node:crypto`, which Workers provide through `nodejs_compat`. The Workers runtime itself is
 * exercised by `scripts/runtime-http-suite.ts --runtime workers`, which serves a built `api`
 * template in workerd.
 */
import { createHash } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { detectRuntime, loadRuntimeAdapter } from "../../src/runtime/current-runtime.ts";
import { workersRuntime } from "../../src/runtime/workers/index.ts";

const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");

afterEach(() => {
  if (navigatorDescriptor === undefined) Reflect.deleteProperty(globalThis, "navigator");
  else Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
});

test("the Workers adapter reports no listener, filesystem, processes or registry", async () => {
  expect(workersRuntime.name).toBe("workers");
  expect(workersRuntime.files).toBeUndefined();
  expect(workersRuntime.modules.registry).toBeUndefined();
  expect(workersRuntime.processes.which("bun")).toBeNull();
  expect(() => workersRuntime.processes.spawn(["bun", "--version"])).toThrow(
    "Cloudflare Workers has no child processes",
  );
  expect(() => workersRuntime.modules.resolve("hono", "/")).toThrow("module resolution");
  await expect(
    workersRuntime.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() }),
  ).rejects.toThrow("Cloudflare Workers has no listener");
});

test("the Workers adapter hashes, creates UUIDs and reads the environment", () => {
  expect(workersRuntime.crypto.sha256Hex("relkit")).toBe(
    createHash("sha256").update("relkit").digest("hex"),
  );
  expect(workersRuntime.crypto.randomUUID()).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );
  process.env.RELKIT_WORKERS_ADAPTER_MARKER = "marker";
  try {
    expect(workersRuntime.environment.get("RELKIT_WORKERS_ADAPTER_MARKER")).toBe("marker");
  } finally {
    delete process.env.RELKIT_WORKERS_ADAPTER_MARKER;
  }
});

test("Workers are detected from their user agent and load the Workers adapter", async () => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "Cloudflare-Workers" },
  });
  expect(detectRuntime()).toBe("workers");
  expect(await loadRuntimeAdapter("workers")).toBe(workersRuntime);
});
