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
  contractVersion: 2,
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
      config: { method: "POST", path: "/orders" },
    },
    { kind: "job", id: "orders.job", source: source("src/jobs.ts") },
    { kind: "event", id: "orders.created", source: source("src/events.ts") },
    { kind: "bucket", id: "orders.bucket", source: source("src/buckets.ts") },
    { kind: "cache", id: "orders.cache", source: source("src/cache.ts") },
    { kind: "tool", id: "orders.tool", source: source("src/tools.ts") },
    { kind: "agent", id: "orders.agent", source: source("src/agents.ts") },
    {
      kind: "service",
      id: "orders",
      source: source("src/services.ts"),
      title: "Orders",
      tags: ["orders"],
      members: [{ name: "create", functionId: "orders.create" }],
      middleware: [{ id: "orders.context" }],
    },
  ],
  edges: [
    { kind: "targets-function", from: "orders.create.http", to: "orders.create" },
    {
      kind: "contains-function",
      from: "orders",
      to: "orders.create",
      member: "create",
      order: 0,
    },
    { kind: "uses-service-middleware", from: "orders", to: "orders.context", order: 0 },
  ],
};

export function getForbiddenReads(): number {
  return forbiddenReads;
}
