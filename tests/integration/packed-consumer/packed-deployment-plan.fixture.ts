/** Retains the existing role-materialization fixture's real host/cache plan for an external packed mock engine. */
import type { DeploymentPlan } from "@relkit/deploy";

const reference = <const Role extends "engine" | "host" | "infrastructure" | "access">(
  role: Role,
  integrationId: string,
  configuration = {},
) => ({ role, integrationId, protocolVersion: 1 as const, configuration });

export const plan: DeploymentPlan = {
  contractVersion: 3,
  graphHash: `sha256:${"b".repeat(64)}`,
  application: {
    id: "packed-offline",
    image: {
      name: "packed-offline",
      tag: "latest",
      health: { livenessPath: "/live", readinessPath: "/ready", port: 3000 },
    },
    environmentNames: [],
  },
  engine: reference("engine", "pulumi"),
  host: reference("host", "aws"),
  connectedBindings: [],
  infrastructureOperations: [
    {
      kind: "infrastructure-operation",
      id: "provider.cache.default",
      bindingId: "provider.cache.default",
      capability: "cache",
      profile: "default",
      adapter: {
        integrationId: "redis",
        adapterId: "redis",
        protocolVersion: 1,
        behavior: {},
        connectionContract: { url: { required: true, sensitive: true, authoredValue: "fallback" } },
        connection: {},
        features: ["atomicIncrement"],
      },
      namedValues: [],
      integration: reference("infrastructure", "aws", { engine: "valkey" }),
    },
  ],
  accessOperations: [
    {
      kind: "access-operation",
      id: "provider.cache.default.access",
      bindingId: "provider.cache.default",
      integration: reference("access", "aws", { kind: "network", port: 6379 }),
    },
  ],
  http: {
    logicalName: "packed-offline-http",
    port: 3000,
    health: { livenessPath: "/live", readinessPath: "/ready", port: 3000 },
    routes: [],
    configurationNames: [],
  },
  jobs: [],
  schedules: [],
  events: [],
  eventTriggers: [],
  buckets: [],
  caches: [],
  iam: { serviceRole: { statements: [] }, perFunction: [] },
};
