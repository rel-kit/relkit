/**
 * Selects the packages/capabilities taught by each install fragment. Versions,
 * SDK sections and repairs come from their existing owners, so neighboring
 * optional capabilities cannot enter a recipe through a broad example manifest.
 */
import type { InstallationRecipe } from "./installation-catalog.types.js";

const database = { name: "@relkit/drizzle", capabilities: ["drizzle"] } as const;
const local = { name: "@relkit/local" } as const;
const nativeAgent = { name: "@relkit/langchain", capabilities: ["agent-execution"] } as const;
const client = { name: "@relkit/client", peers: ["@opentelemetry/api"] } as const;

export const installationRecipes = {
  database: {
    title: "SQLite database",
    selections: [database],
    tools: ["drizzle-kit"],
    drizzlePatch: true,
  },
  "database-mysql": {
    title: "MySQL model declarations",
    selections: [{ name: "@relkit/drizzle", capabilities: ["mysql"], includeOwner: false }],
  },
  auth: {
    title: "Better Auth backend",
    selections: [database, { name: "@relkit/better-auth", capabilities: ["better-auth"] }],
    tools: ["drizzle-kit"],
    drizzlePatch: true,
    betterFetch: true,
  },
  "auth-client": {
    title: "Native Better Auth browser client",
    selections: [
      { name: "@relkit/better-auth", capabilities: ["better-auth"], includeOwner: false },
    ],
    betterFetch: true,
  },
  agent: { title: "Native agent", selections: [nativeAgent, local] },
  "deep-agent": {
    title: "Native deep agent",
    selections: [
      { name: "@relkit/langchain", capabilities: ["agent-execution", "agent-deep"] },
      local,
    ],
  },
  tools: { title: "Function tools", selections: [{ name: "@relkit/tools" }] },
  mcp: {
    title: "Tool-only MCP",
    selections: [{ name: "@relkit/runtime-hono", capabilities: ["mcp"], includeOwner: false }],
  },
  "ag-ui": {
    title: "AG-UI transport",
    selections: [{ name: "@relkit/runtime-hono", capabilities: ["ag-ui"], includeOwner: false }],
  },
  scalar: {
    title: "Scalar UI",
    selections: [{ name: "@relkit/runtime-hono", capabilities: ["scalar"], includeOwner: false }],
  },
  client: { title: "Framework-independent client", selections: [client] },
  "client-query": {
    title: "TanStack Query client",
    selections: [
      { ...client, peers: [...client.peers, "@orpc/tanstack-query", "@tanstack/query-core"] },
    ],
  },
  "client-react": {
    title: "React client",
    selections: [
      {
        ...client,
        peers: [
          ...client.peers,
          "@orpc/tanstack-query",
          "@tanstack/query-core",
          "@tanstack/react-query",
          "react",
        ],
      },
    ],
  },
  "auth-react": {
    title: "Better Auth React client",
    selections: [client, { name: "@relkit/better-auth", peers: ["react"] }],
  },
  "client-cli": {
    title: "Frontend contract tooling",
    selections: [{ name: "@relkit/cli", section: "devDependencies" }],
  },
  testing: {
    title: "Generic test harness",
    selections: [{ name: "@relkit/testing", section: "devDependencies" }],
  },
  redis: {
    title: "Redis cache",
    selections: [{ name: "@relkit/redis" }, { name: "@relkit/docker" }],
  },
  "redis-connected": { title: "Connected Redis", selections: [{ name: "@relkit/redis" }] },
  s3: {
    title: "S3-compatible bucket",
    selections: [{ name: "@relkit/s3" }, { name: "@relkit/docker" }],
  },
  "s3-connected": { title: "Connected S3", selections: [{ name: "@relkit/s3" }] },
  cloudflare: { title: "Connected Cloudflare", selections: [{ name: "@relkit/cloudflare" }] },
  local: { title: "Local runtime", selections: [local] },
  docker: { title: "Docker resources", selections: [{ name: "@relkit/docker" }] },
  inngest: {
    title: "Inngest jobs",
    selections: [
      { name: "@relkit/inngest", capabilities: ["job"] },
      { name: "@relkit/docker" },
      local,
    ],
  },
  "effect-mq": {
    title: "Effect MQ jobs",
    selections: [
      { name: "@relkit/effect-mq", capabilities: ["job"] },
      { name: "@relkit/docker" },
      local,
    ],
    drizzlePatch: true,
  },
  trigger: {
    title: "Trigger jobs",
    selections: [
      { name: "@relkit/trigger", capabilities: ["job"] },
      { name: "@relkit/docker" },
      local,
    ],
  },
  otlp: { title: "OTLP export", selections: [{ name: "@relkit/otlp" }] },
  sentry: {
    title: "Sentry export",
    selections: [{ name: "@relkit/sentry", capabilities: ["telemetry"] }],
  },
  deployment: {
    title: "Existing AWS/Pulumi deployment",
    selections: [
      {
        name: "@relkit/aws",
        capabilities: ["host", "infrastructure", "access"],
        phases: ["deploy"],
        section: "devDependencies",
      },
      {
        name: "@relkit/pulumi",
        capabilities: ["engine"],
        phases: ["deploy"],
        section: "devDependencies",
      },
    ],
  },
  inspector: {
    title: "Standalone Inspector",
    selections: [{ name: "@relkit/inspector" }],
    global: true,
  },
} as const satisfies Readonly<Record<string, InstallationRecipe>>;
