import type { PerformanceGeneration } from "./performance-core-consumers-fixture.types.js";

/**
 * Recreates the sensitive graph and runtime records from the baseline fixture.
 * @returns Generation data with throwing handler/provider getters and isolated read counts.
 */
export function createPerformanceGeneration(): PerformanceGeneration {
  const secret = "raw-inspector-secret";
  let forbiddenReads = 0;
  /**
   * Adds getters that fail if a projection touches executable implementation details.
   * @typeParam T - Original record shape retained by the fixture.
   * @param value - Fixture record that may be safely projected selectively.
   * @returns The record with poisoned enumerable properties.
   */
  function poison<T extends Record<string, unknown>>(value: T): T {
    for (const key of ["handler", "providerFile"]) {
      Object.defineProperty(value, key, {
        configurable: true,
        enumerable: true,
        get() {
          forbiddenReads += 1;
          throw new Error(`${key} was read`);
        },
      });
    }
    return value;
  }

  /**
   * Gives a declaration its baseline source location.
   * @param file - Declaration-owned fixture path.
   * @returns The first position in that fixture source.
   */
  const source = (file: string) => ({ file, line: 1, column: 1 });
  const graph = {
    contractVersion: 6,
    appId: "contract-fixture",
    nodes: [
      {
        kind: "env",
        id: "DATABASE_URL",
        source: source("src/env.ts"),
        sensitive: true,
        value: secret,
      },
      poison({
        kind: "function",
        id: "orders.create",
        domainId: "orders",
        exposure: "public",
        source: source("src/orders.ts"),
        input: { password: secret, orderId: { type: "string" } },
        output: { type: "object" },
      }),
      {
        kind: "trigger",
        id: "orders.create.http",
        source: source("src/routes.ts"),
        triggerType: "http",
        targetFunctionId: "orders.create",
        config: {
          method: "POST",
          path: "/orders",
          middleware: [{ id: "orders.auth", path: "/orders/*", order: 0, match: "always" }],
        },
      },
      {
        kind: "middleware",
        id: "orders.auth",
        source: source("src/middleware.ts"),
        path: "/orders/*",
        order: 0,
      },
      { kind: "job", id: "orders.job", source: source("src/jobs.ts") },
      {
        kind: "event",
        id: "orders.created",
        domainId: "orders",
        exposure: "public",
        source: source("src/events.ts"),
      },
      {
        kind: "error",
        id: "orders.invalid",
        domainId: "orders",
        exposure: "public",
        data: { type: "object" },
        retry: "never",
        source: source("src/orders/errors/invalid.error.ts"),
      },
      { kind: "bucket", id: "orders.bucket", source: source("src/buckets.ts") },
      { kind: "cache", id: "orders.cache", source: source("src/cache.ts") },
      { kind: "tool", id: "orders.tool", source: source("src/tools.ts") },
      { kind: "agent", id: "orders.agent", source: source("src/agents.ts") },
      {
        kind: "channel",
        id: "orders.updates",
        source: source("src/channels.ts"),
        client: { exposure: "protected" },
        events: { "status.changed": { type: "object" } },
        presence: { kind: "count" },
      },
      {
        kind: "provider",
        id: "provider.buckets.default",
        source: source("relkit.config.ts"),
        capability: "buckets",
        profile: "default",
        adapter: "s3",
        ownership: "external",
      },
      {
        kind: "service",
        id: "orders",
        domainId: "orders",
        source: source("src/orders/service.ts"),
        title: "Orders",
        tags: ["orders"],
        functions: [{ name: "create", functionId: "orders.create" }],
        events: [{ name: "created", eventId: "orders.created" }],
      },
    ],
    edges: [
      { kind: "targets-function", from: "orders.create.http", to: "orders.create" },
      {
        kind: "uses-middleware",
        from: "orders.create.http",
        to: "orders.auth",
        order: 0,
        match: "always",
      },
      { kind: "exposes-function", from: "orders", to: "orders.create", member: "create", order: 0 },
      { kind: "declares-error", from: "orders.create", to: "orders.invalid" },
    ],
  };
  /**
   * Creates one sensitive runtime record with the same poison assertions.
   * @param id - Fixed fixture runtime declaration.
   * @returns A record retaining the baseline available/ready states.
   */
  const runtimeItem = (id: string) =>
    poison({ id, status: "ready", state: "available", password: secret });
  return {
    secret,
    getForbiddenReads: () => forbiddenReads,
    generation: {
      generationId: "generation-one",
      graphHash: "sha256:one",
      graph,
      runtime: {
        functions: [runtimeItem("orders.create")],
        jobs: [runtimeItem("orders.job")],
        events: [runtimeItem("orders.created")],
        buckets: [runtimeItem("orders.bucket")],
        cache: [runtimeItem("orders.cache")],
        tools: [runtimeItem("orders.tool")],
        agents: [runtimeItem("orders.agent")],
      },
      diagnostics: [{ code: "RELKIT_TEST", severity: "warning", message: "safe diagnostic" }],
      environment: () => ({ DATABASE_URL: secret }),
    },
  };
}
