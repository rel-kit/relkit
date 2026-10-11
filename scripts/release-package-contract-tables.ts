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

/** Side-effect-free catalog entry points map directly to named dist files. */
export const catalogSubpaths = [
  "redis",
  "s3",
  "docker",
  "local",
  "cloudflare",
  "sentry",
  "otlp",
  "aws",
  "pulumi",
  "inngest",
  "trigger",
  "effect-mq",
] as const;
