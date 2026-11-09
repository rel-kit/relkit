/** The Core and Labs table: one row per feature, checked and rendered by `scripts/maturity.ts`. */

export type MaturityTier = "core" | "labs";

/** One row of the maturity table. Every workspace package belongs to at least one feature. */
export interface MaturityFeature {
  readonly name: string;
  readonly tier: MaturityTier;
  readonly packages: readonly string[];
  /** Docs routes for the feature; every route of a Labs feature carries `labs: true`. */
  readonly docs: readonly string[];
  readonly note?: string;
}

const core = (
  name: string,
  packages: readonly string[],
  docs: readonly string[],
  note?: string,
): MaturityFeature => ({ name, tier: "core", packages, docs, ...(note ? { note } : {}) });
const labs = (
  name: string,
  packages: readonly string[],
  docs: readonly string[],
): MaturityFeature => ({ name, tier: "labs", packages, docs });

export const MATURITY_FEATURES: readonly MaturityFeature[] = [
  core(
    "Application model and compiler",
    [
      "relkit",
      "@relkit/app",
      "relkit/contracts",
      "relkit/graph",
      "relkit/engine",
      "relkit/invocation",
      "relkit/diagnostics",
      "relkit/provider",
      "relkit/runtime-effect",
    ],
    ["/docs/learn/concepts/application"],
  ),
  core("Functions", ["relkit/functions"], ["/docs/learn/concepts/functions"]),
  core("Services", ["relkit/services"], ["/docs/modules/service"]),
  core(
    "Routes",
    ["relkit/routes", "relkit/runtime-hono", "relkit/runtime"],
    ["/docs/modules/http"],
  ),
  core("Schemas", ["relkit/schema", "relkit/openapi"], ["/docs/learn/concepts/schemas"]),
  core("Env and config", ["relkit/config"], ["/docs/learn/concepts/environment"]),
  core("Events", ["relkit/events"], ["/docs/modules/events"]),
  core(
    "Jobs and schedules with local and Postgres backends",
    ["relkit/jobs", "@relkit/local", "relkit/providers-local", "relkit/local-service"],
    ["/docs/modules/jobs"],
  ),
  core("Cache", ["relkit/cache", "@relkit/redis"], ["/docs/modules/caching"]),
  core("Buckets", ["relkit/buckets", "@relkit/s3"], ["/docs/modules/storage"]),
  core("Drizzle", ["@relkit/drizzle"], ["/docs/modules/database/drizzle"]),
  core("Better Auth", ["@relkit/better-auth"], ["/docs/modules/auth/better-auth"]),
  core(
    "Built-in telemetry",
    ["relkit/observability", "@relkit/inspector"],
    ["/docs/modules/operations/observability"],
  ),
  core("Typed client", ["@relkit/client"], ["/docs/modules/client"]),
  core("Testing", ["@relkit/testing"], ["/docs/modules/operations/testing"]),
  core("CLI", ["relkit", "@relkit/cli", "create-relkit"], ["/docs/modules/cli"]),
  core(
    "Inspector",
    ["@relkit/inspector", "relkit/inspector-api"],
    ["/docs/modules/operations/inspector"],
  ),
  core("relkit mcp", ["@relkit/cli"], ["/docs/modules/ai/mcp"]),
  core("Agent declarations and tools", ["relkit/agents", "relkit/tools"], ["/docs/modules/ai"]),
  core("Bun and Node LTS runtimes", [], ["/docs/learn/local-development"]),
  core("Integration catalog", ["create-relkit"], ["/docs/modules/integrations"]),
  core(
    "Provider and adapter contract",
    [
      "relkit/provider",
      "relkit/cache",
      "relkit/buckets",
      "relkit/events",
      "relkit/jobs",
      "relkit/runtime",
      "@relkit/testing",
      "@relkit/cli",
    ],
    ["/docs/modules/integrations/provider-kit", "/docs/modules/integrations/provider-authoring"],
    "Realtime and agent adapter contracts follow their Labs features",
  ),
  core(
    "Docker deploy",
    ["@relkit/docker", "relkit/deploy"],
    ["/docs/modules/deployment/local-docker"],
  ),

  labs(
    "Realtime",
    ["relkit/realtime"],
    [
      "/docs/modules/realtime",
      "/docs/modules/realtime/access",
      "/docs/modules/realtime/react",
      "/docs/modules/realtime/presence",
      "/docs/modules/realtime/recovery",
      "/docs/modules/realtime/providers",
      "/docs/api/realtime",
    ],
  ),
  labs("Railway deploy", [], ["/docs/modules/deployment/railway"]),
  labs("Vercel deploy", [], ["/docs/modules/deployment/vercel"]),
  labs("Cloudflare deploy", [], ["/docs/modules/deployment/cloudflare"]),
  labs("Cloudflare Workers runtime", [], ["/docs/modules/deployment/cloudflare"]),
  labs(
    "AWS hosting",
    ["@relkit/aws", "@relkit/pulumi"],
    ["/docs/modules/deployment/aws", "/docs/api/integrations/aws", "/docs/api/integrations/pulumi"],
  ),
  labs("Cloudflare bindings", ["@relkit/cloudflare"], ["/docs/api/integrations/cloudflare"]),
  labs(
    "Inngest job adapter",
    ["@relkit/inngest"],
    ["/docs/modules/jobs/providers/inngest", "/docs/api/integrations/inngest"],
  ),
  labs(
    "Trigger.dev job adapter",
    ["@relkit/trigger"],
    ["/docs/modules/jobs/providers/trigger", "/docs/api/integrations/trigger"],
  ),
  labs(
    "Effect MQ job adapter",
    ["@relkit/effect-mq"],
    ["/docs/modules/jobs/providers/effect-mq", "/docs/api/integrations/effect-mq"],
  ),
  labs(
    "Postgres durable backend",
    ["@relkit/postgres"],
    ["/docs/modules/jobs/providers/postgres", "/docs/api/integrations/postgres"],
  ),
  labs(
    "Agent adapters (LangChain, DeepAgents and AI SDK)",
    ["relkit/agent-adapters", "@relkit/langchain", "@relkit/ai-sdk"],
    [
      "/docs/modules/ai/adapters",
      "/docs/modules/ai/native-runtime",
      "/docs/api/agent-adapters",
      "/docs/api/integrations/langchain",
      "/docs/api/integrations/ai-sdk",
    ],
  ),
  labs("Graph workflows", ["@relkit/langchain"], ["/docs/modules/ai/graphs-persistence"]),
  labs("Sentry telemetry", ["@relkit/sentry"], ["/docs/api/integrations/sentry"]),
  labs("OTLP telemetry", ["@relkit/otlp"], ["/docs/api/integrations/otlp"]),
];
