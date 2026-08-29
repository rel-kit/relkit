export const identity = { generationId: "generation-one", graphHash: "sha256:one" };
export const secret = "raw-inspector-secret";
let forbiddenReads = 0;

const source = (file: string) => ({ file, line: 1, column: 1 });

export function poison<T extends Record<string, unknown>>(value: T): T {
  for (const key of ["handler", "providerFile"]) {
    Object.defineProperty(value, key, {
      configurable: true,
      enumerable: true,
      get() {
        forbiddenReads += 1;
        throw new Error(key + " was read");
      },
    });
  }
  return value;
}

export const graph = {
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
    {
      kind: "exposes-function",
      from: "orders",
      to: "orders.create",
      member: "create",
      order: 0,
    },
    { kind: "declares-error", from: "orders.create", to: "orders.invalid" },
  ],
};

export function getForbiddenReads(): number {
  return forbiddenReads;
}
