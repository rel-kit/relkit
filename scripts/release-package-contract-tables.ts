/**
 * Defines pure authoring and integration subpath inventories for release checks.
 * Export rendering owns conditions and dist mappings; these lists authorize only
 * intentional entry points, including the prepared server's internal app leaf.
 */

/** Application authoring and internal runtime leaves required by packed manifests. */
export const appSubpaths = [
  "schema",
  "config",
  "internal/runtime",
  "routes",
  "functions",
  "events",
  "realtime",
  "agents",
  "jobs",
  "jobs/legacy",
  "tasks",
  "cache",
  "tools",
  "buckets",
  "services",
] as const;

/** Former packages merged into `relkit`; each keeps its exports under `relkit/<area>`. */
export const relkitAreas = [
  "agents",
  "buckets",
  "cache",
  "config",
  "contracts",
  "deploy",
  "diagnostics",
  "engine",
  "events",
  "functions",
  "graph",
  "invocation",
  "jobs",
  "local-service",
  "observability",
  "openapi",
  "provider",
  "providers-local",
  "realtime",
  "routes",
  "runtime-effect",
  "runtime-hono",
  "schema",
  "services",
  "tools",
] as const;

/** Integration packages expose finite capability leaves beside their catalog root. */
export const integrationSubpaths: Readonly<Record<string, readonly string[]>> = {
  "@relkit/aws": ["host", "infrastructure", "access"],
  "@relkit/cloudflare": ["runtime"],
  "@relkit/docker": ["runtime"],
  "@relkit/local": ["runtime"],
  "@relkit/otlp": ["runtime"],
  "@relkit/pulumi": ["engine"],
  "@relkit/redis": ["runtime", "local-recipe"],
  "@relkit/s3": ["runtime", "local-recipe"],
  "@relkit/sentry": ["runtime"],
  "@relkit/inngest": ["runtime", "local-recipe", "deployment"],
  "@relkit/trigger": ["runtime", "local-recipe", "deployment"],
  "@relkit/effect-mq": ["runtime", "local-recipe", "deployment"],
};
