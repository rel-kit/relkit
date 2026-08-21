import { describe, expect, test } from "bun:test";
import { GENERATOR_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import type { RegistrationPlan } from "@zsys/graph";
import {
  API_REFERENCE_PATH,
  ApiDocsConfigurationError,
  createApp,
  OPENAPI_PATH,
  type RuntimeManifest,
} from "./src/index.js";

const source = { file: "src/routes/hello/route.ts", line: 1, column: 1 } as const;
const plan: RegistrationPlan = {
  graphHash: "sha256:api-docs",
  functions: [
    {
      kind: "function",
      id: "hello",
      serviceId: "hello-service",
      source,
      input: { type: "object", properties: {} },
      output: { type: "object", properties: { ok: { type: "boolean" } } },
    },
  ],
  httpTriggers: [
    {
      kind: "trigger",
      id: "hello.http",
      source,
      triggerType: "http",
      targetFunctionId: "hello",
      serviceId: "hello-service",
      config: {
        method: "GET",
        path: "/hello",
        request: { kind: "input", fields: {} },
        responses: [{ kind: "success", id: "success.200", status: 200 }],
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
  services: [
    {
      kind: "service",
      id: "hello-service",
      source,
      title: "Hello",
      description: "Hello operations",
      tags: ["hello"],
      members: [{ name: "hello", functionId: "hello" }],
      middleware: [],
    },
  ],
};
const manifest: RuntimeManifest = {
  contractVersion: MANIFEST_VERSION,
  generatorVersion: GENERATOR_VERSION,
  graphHash: plan.graphHash,
  functions: {},
  middleware: {},
  requestTransforms: {},
};

describe("OpenAPI and Scalar endpoints", () => {
  test("serves the active document and URL-backed Scalar page during development", async () => {
    const service = app();
    const raw = await service.request(OPENAPI_PATH);
    const document = await raw.json();
    const reference = await service.request(API_REFERENCE_PATH);
    const html = await reference.text();

    expect(raw.status).toBe(200);
    expect(raw.headers.get("cache-control")).toBe("no-store");
    expect(document).toMatchObject({
      openapi: "3.1.0",
      tags: [{ name: "hello", description: "Hello operations" }],
      paths: { "/hello": { get: { tags: ["hello"] } } },
    });
    expect(reference.status).toBe(200);
    expect(reference.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("ZSYS API Reference");
    expect(html).toContain("./openapi.json");
  });

  test("requires production opt-in and existing authorization, embedding the protected document", async () => {
    expect(() => app({ mode: "production", enabledInProduction: true })).toThrow(
      ApiDocsConfigurationError,
    );
    const disabled = app({ mode: "production", bearerToken: "secret" });
    expect((await disabled.request(OPENAPI_PATH)).status).toBe(404);

    const protectedService = app({
      mode: "production",
      enabledInProduction: true,
      bearerToken: "secret",
      document: {
        openapi: "3.1.0",
        info: { title: "Protected ZSYS API", version: "1" },
        paths: {},
      },
    });
    expect((await protectedService.request(OPENAPI_PATH)).status).toBe(401);
    expect((await protectedService.request(API_REFERENCE_PATH)).status).toBe(401);
    const headers = { authorization: "Bearer secret" };
    const raw = await protectedService.request(OPENAPI_PATH, { headers });
    const reference = await protectedService.request(API_REFERENCE_PATH, { headers });
    const html = await reference.text();

    expect(raw.status).toBe(200);
    expect(await raw.json()).toMatchObject({ info: { title: "Protected ZSYS API" } });
    expect(reference.status).toBe(200);
    expect(html).toContain("Protected ZSYS API");
    expect(html).not.toContain(`\"url\":\"${OPENAPI_PATH}\"`);
  });
});

function app(apiDocs = {}) {
  return createApp({
    plan,
    manifest,
    engine: { invoke: async () => ({ ok: true }) },
    apiDocs,
  });
}
