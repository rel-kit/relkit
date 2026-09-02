import { describe, expect, test } from "bun:test";
import { API_BASE_PATH } from "@relkit/contracts";
import { Hono } from "hono";
import { installInspectorEndpoints } from "./src/index.ts";

const graph = {
  contractVersion: 3,
  appId: "test-app",
  nodes: [
    {
      kind: "app",
      id: "test-app",
      source: { file: "src/app.ts", line: 1, column: 1 },
      telemetry: {
        exportSampling: { traceRate: 0.25, minimumLogLevel: "warn" },
        exporters: {
          errors: {
            kind: "telemetry-exporter",
            protocolVersion: 1,
            integrationId: "sentry",
            adapterId: "sentry",
            configuration: { dsn: "must-not-cross" },
          },
        },
      },
      deploymentRoles: [
        {
          role: "host",
          integrationId: "aws",
          protocolVersion: 1,
          configuration: { region: "secret" },
        },
      ],
    },
    {
      kind: "env",
      id: "DATABASE_URL",
      source: { file: "src/app.ts", line: 1, column: 1 },
      name: "DATABASE_URL",
      type: "string",
      requiredIn: ["development"],
      hasDefault: false,
      sensitive: true,
    },
    {
      kind: "function",
      invocationMode: "callable",
      id: "orders.create",
      source: { file: "src/orders.ts", line: 4, column: 1 },
      input: {
        type: "object",
        properties: { password: { type: "string", default: "raw-secret" } },
      },
      output: { type: "object" },
      handler: () => "must-not-cross",
    },
    {
      kind: "trigger",
      id: "orders.create.http",
      source: { file: "src/routes.ts", line: 3, column: 1 },
      triggerType: "http",
      targetFunctionId: "orders.create",
      config: { method: "POST", path: "/orders" },
    },
    {
      kind: "provider",
      id: "provider.cache.default",
      source: { file: "src/app.ts", line: 2, column: 1 },
      capability: "cache",
      profile: "default",
      adapter: {
        integrationId: "redis",
        adapterId: "redis",
        protocolVersion: 1,
        features: ["atomicIncrement"],
        connection: { url: "redis://must-not-cross" },
      },
      providerSource: { kind: "connected" },
      namedValues: [{ field: "url", name: "CACHE_URL", type: "secret-string", sensitive: true }],
      local: { integrationId: "redis", recipeId: "redis-docker", recipeVersion: 1 },
      deploymentRoles: [],
    },
  ],
  edges: [
    { kind: "targets-function", from: "orders.create.http", to: "orders.create", role: "primary" },
  ],
};

function generation(id: string, hash: string) {
  return {
    generationId: id,
    graphHash: hash,
    activationFingerprint: {
      graphHash: hash,
      manifestHash: `${hash}:manifest`,
      runtimeIntegrationsPlanHash: `${hash}:runtime-integrations`,
      localServicesPlanHash: `${hash}:local-services`,
      providerOverridesGeneration: `${hash}:overrides`,
    },
    graph,
    integrations: {
      integrations: [
        {
          integrationId: "redis",
          capability: "cache",
          adapterId: "redis",
          protocolVersion: 1,
          packageName: "@relkit/redis",
          packageVersion: "0.2.0",
          exportName: "./runtime",
        },
      ],
    },
    localServices: {
      plan: {
        services: [
          {
            bindingId: "provider.cache.default",
            capability: "cache",
            profile: "default",
            materializerId: "docker",
            recipe: { integrationId: "redis", recipeId: "redis-docker", recipeVersion: 1 },
            configuration: { password: "must-not-cross" },
            requiredBy: ["cache.sessions"],
          },
        ],
      },
      runtime: {
        lease: { mode: "detached", status: "adopted", sessionId: "must-not-cross" },
        state: {
          applicationId: "test-app",
          planHash: `${hash}:local-services`,
          services: [{ bindingId: "provider.cache.default", phase: "healthy" }],
        },
      },
    },
    telemetry: () => ({
      sampling: { traceRate: 0.25, minimumLogLevel: "warn", token: "must-not-cross" },
      counters: { persisted: 5, sampledOut: 2, credential: "must-not-cross" },
      exporters: [
        {
          name: "errors",
          integrationId: "sentry",
          adapterId: "sentry",
          healthy: true,
          exported: 3,
          dsn: "must-not-cross",
        },
      ],
    }),
    environment: () => ({ DATABASE_URL: "database-secret" }),
    diagnostics: [{ code: "RELKIT_TEST", severity: "warning", message: "safe diagnostic" }],
    runtime: {
      functions: [
        {
          id: "orders.create",
          status: "completed",
          handler: () => "must-not-cross",
          stateRoot: "/private/provider-state",
          password: "raw-secret",
        },
      ],
      jobs: [
        {
          instanceId: "job-1",
          state: "available",
          attempt: 1,
          nextRunAt: 1_700_000_000_000,
          schedules: [{ id: "hourly", nextFireAt: 1_700_000_000_000 }],
        },
      ],
    },
  };
}

describe("versioned inspector router", () => {
  test("reads only the active generation with bounded safe projections", async () => {
    let active = generation("generation-one", "sha256:one");
    let environmentReads = 0;
    active.environment = () => {
      environmentReads += 1;
      return { DATABASE_URL: "database-secret" };
    };
    const app = new Hono();
    installInspectorEndpoints(app, {
      getActiveGeneration: () => active,
    });

    const graphResponse = await app.request(`${API_BASE_PATH}/graph`);
    const graphBody = await graphResponse.json();
    expect(graphResponse.status).toBe(200);
    expect(graphBody).toMatchObject({
      graphHash: "sha256:one",
      activationFingerprint: {
        graphHash: "sha256:one",
        manifestHash: "sha256:one:manifest",
        runtimeIntegrationsPlanHash: "sha256:one:runtime-integrations",
      },
      graph: { appId: "test-app" },
      integrations: [
        {
          integrationId: "redis",
          packageName: "@relkit/redis",
          packageVersion: "0.2.0",
        },
      ],
    });
    expect(JSON.stringify(graphBody)).not.toContain("raw-secret");
    expect(JSON.stringify(graphBody)).not.toContain("must-not-cross");
    expect(JSON.stringify(graphBody)).not.toContain("./runtime");

    const providers = await (await app.request(`${API_BASE_PATH}/providers`)).json();
    expect(providers.items).toMatchObject([
      {
        id: "provider.cache.default",
        capability: "cache",
        profile: "default",
        adapter: { integrationId: "redis", adapterId: "redis", features: ["atomicIncrement"] },
        providerSource: { kind: "connected" },
        namedValues: [{ name: "CACHE_URL", sensitive: true }],
        local: { recipeId: "redis-docker" },
      },
    ]);

    const runtimeMetadata = await (await app.request(`${API_BASE_PATH}/runtime`)).json();
    expect(runtimeMetadata).toMatchObject({
      localServices: {
        planHash: "sha256:one:local-services",
        lease: { mode: "detached", status: "adopted" },
        items: [{ bindingId: "provider.cache.default", phase: "healthy" }],
      },
      telemetry: {
        sampling: {
          traceRate: 0.25,
          minimumLogLevel: "warn",
          errors: "always",
          diagnostics: "always",
        },
        counters: { persisted: 5, sampledOut: 2 },
        exporters: [{ name: "errors", healthy: true, exported: 3 }],
      },
    });
    expect(JSON.stringify(runtimeMetadata)).not.toContain("must-not-cross");

    const functions = await app.request(`${API_BASE_PATH}/functions?limit=1`);
    expect((await functions.json()).items).toHaveLength(1);
    const searched = await app.request(`${API_BASE_PATH}/functions?search=orders&kind=function`);
    expect((await searched.json()).items).toMatchObject([{ id: "orders.create" }]);
    const routes = await app.request(`${API_BASE_PATH}/routes?kind=POST&search=orders`);
    expect((await routes.json()).items).toMatchObject([{ id: "orders.create.http" }]);
    const filteredRuntime = await app.request(
      `${API_BASE_PATH}/runtime/functions?status=completed&search=orders`,
    );
    expect((await filteredRuntime.json()).items).toMatchObject([{ id: "orders.create" }]);
    const runtime = await app.request(`${API_BASE_PATH}/runtime/functions`);
    expect((await runtime.json()).items).toMatchObject([
      { id: "orders.create", status: "completed" },
    ]);
    expect((await (await app.request(`${API_BASE_PATH}/runtime/jobs`)).json()).items).toMatchObject(
      [
        {
          instanceId: "job-1",
          nextRunAt: 1_700_000_000_000,
          schedules: [{ id: "hourly", nextFireAt: 1_700_000_000_000 }],
        },
      ],
    );
    expect(await (await app.request(`${API_BASE_PATH}/env`)).json()).toMatchObject({
      items: [{ name: "DATABASE_URL", sensitive: true }],
    });
    expect(await (await app.request(`${API_BASE_PATH}/source/orders.create`)).json()).toMatchObject(
      {
        source: { file: "src/orders.ts", line: 4 },
      },
    );
    expect((await app.request(`${API_BASE_PATH}/diagnostics`)).status).toBe(200);
    expect(environmentReads).toBe(0);

    active = generation("generation-two", "sha256:two");
    expect((await (await app.request(`${API_BASE_PATH}/graph`)).json()).graphHash).toBe(
      "sha256:two",
    );
  });

  test("negotiates versions, bounds cursors, and protects production", async () => {
    const app = new Hono();
    installInspectorEndpoints(app, {
      activeGeneration: generation("generation-one", "sha256:one"),
    });
    expect((await app.request(`${API_BASE_PATH}/functions?limit=0`)).status).toBe(400);
    expect((await app.request(`${API_BASE_PATH}/graph?version=2`)).status).toBe(400);

    const disabled = new Hono();
    installInspectorEndpoints(disabled, {
      mode: "production",
      activeGeneration: generation("g", "h"),
    });
    expect((await disabled.request(`${API_BASE_PATH}`)).status).toBe(404);
    expect(() =>
      installInspectorEndpoints(new Hono(), {
        mode: "production",
        enabled: true,
        activeGeneration: generation("g", "h"),
      }),
    ).toThrow();

    const secured = new Hono();
    installInspectorEndpoints(secured, {
      mode: "production",
      enabled: true,
      bearerToken: "test-token",
      activeGeneration: generation("g", "h"),
    });
    expect((await secured.request(`${API_BASE_PATH}`)).status).toBe(401);
    expect(
      (
        await secured.request(`${API_BASE_PATH}`, {
          headers: { authorization: "Bearer test-token" },
        })
      ).status,
    ).toBe(200);
  });
});
