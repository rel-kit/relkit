/**
 * RK-21 in development: an oversize body sent through the `relkit dev` proxy gets the same 413
 * `payload-too-large` answer as in production, with or without a declared `Content-Length`.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import type { RegistrationPlan } from "relkit/graph";
import { createApp } from "relkit/runtime-hono";
import { instrumentHttpRequest } from "relkit/runtime-hono/prepared";
import {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "relkit/contracts";
import { createSupervisorProxy, type SupervisorProxy } from "../../../src/supervisor/proxy.js";

const LIMIT = 1024;
let worker: Bun.Server<undefined>;
let proxy: SupervisorProxy;
let port = 0;

beforeAll(async () => {
  const graphHash = "sha256:proxy-oversize";
  const plan = {
    graphHash,
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "echo.raw",
        source: { file: "route.ts", line: 1, column: 1 },
        triggerType: "http",
        targetFunctionId: "echo.raw",
        config: {
          method: "POST",
          path: "/echo",
          rawHandler: true,
          request: {},
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
    channels: [],
    middlewares: [],
  } as unknown as RegistrationPlan;
  const app = createApp({
    plan,
    manifest: {
      contractVersion: MANIFEST_VERSION,
      generatorVersion: GENERATOR_VERSION,
      graphHash,
      activationFingerprint: {
        graphHash,
        manifestHash: "sha256:test-manifest",
        runtimeIntegrationsPlanHash: "sha256:test-runtime-integrations",
      },
      runtimeIntegrationsPlan: {
        version: RUNTIME_INTEGRATION_PLAN_VERSION,
        fileName: RUNTIME_INTEGRATION_PLAN_FILE,
        graphHash,
      },
      functions: {},
      middleware: {},
      requestTransforms: {},
      routes: {
        "echo.raw": {
          handler: async (request: Request) =>
            Response.json({ bytes: (await request.arrayBuffer()).byteLength }),
        },
      },
    },
    engine: { invoke: async () => undefined },
    middleware: { maxBodyBytes: LIMIT },
  });
  const options = { maxBodyBytes: LIMIT };
  worker = Bun.serve({
    port: 0,
    fetch: (request) => instrumentHttpRequest(request, options, (inner) => app.fetch(inner)),
  });
  proxy = createSupervisorProxy({ port: 0 });
  await proxy.listen();
  proxy.switchTarget({ token: { sourceToken: 1, generationToken: 1 }, port: worker.port! });
  port = proxy.port;
});

afterAll(async () => {
  await proxy.stop();
  await worker.stop(true);
});

/** Streams `size` bytes without a Content-Length header. */
function chunked(size: number): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(size).fill(120));
      controller.close();
    },
  });
}

for (const framing of ["declared", "streamed"] as const)
  test(`a ${framing} oversize body gets 413 payload-too-large through the proxy`, async () => {
    const size = LIMIT * 4;
    const response = await fetch(`http://127.0.0.1:${port}/echo`, {
      method: "POST",
      body: framing === "declared" ? "x".repeat(size) : chunked(size),
      ...(framing === "declared" ? {} : { duplex: "half" }),
    } as RequestInit);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ status: 413, code: "payload-too-large" });
    const fits = await fetch(`http://127.0.0.1:${port}/echo`, {
      method: "POST",
      body: framing === "declared" ? "x".repeat(100) : chunked(100),
      ...(framing === "declared" ? {} : { duplex: "half" }),
    } as RequestInit);
    expect(await fits.json()).toEqual({ bytes: 100 });
  });
