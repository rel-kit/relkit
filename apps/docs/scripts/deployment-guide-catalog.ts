/** Separates application hosting from connected resource and native task deployment. */
import { group, relation } from "./guide-catalog-helpers.js";

export const deploymentGuideGroup = group("docs/modules/deployment", "Deployment", "CloudUpload", [
  "index",
  "local-docker",
  "runtimes",
  "railway",
  "vercel",
  "aws",
  "providers",
]);

export const deploymentGuideRelations = [
  relation(
    "docs/modules/deployment/index",
    ["app", "integrations/aws", "integrations/pulumi"],
    ["examples/commerce/relkit.config.ts"],
  ),
  relation(
    "docs/modules/deployment/local-docker",
    ["app", "integrations/docker"],
    ["templates/default/v1/minimal/relkit.config.ts"],
  ),
  relation(
    "docs/modules/deployment/runtimes",
    ["app", "testing", "drizzle", "integrations/redis", "integrations/sentry"],
    ["templates/default/v1/api/relkit.config.ts"],
  ),
  relation(
    "docs/modules/deployment/railway",
    ["app", "jobs", "events", "integrations/postgres"],
    ["templates/default/v1/api/relkit.config.ts"],
  ),
  relation(
    "docs/modules/deployment/vercel",
    ["app", "jobs", "events", "realtime", "integrations/postgres"],
    ["templates/default/v1/api/relkit.config.ts"],
  ),
  relation(
    "docs/modules/deployment/aws",
    ["app", "jobs", "events", "buckets", "cache", "integrations/aws", "integrations/pulumi"],
    ["examples/commerce/relkit.config.ts"],
  ),
  relation(
    "docs/modules/deployment/providers",
    ["integrations/s3", "integrations/redis", "integrations/cloudflare", "jobs"],
    ["apps/docs/examples/setup/connected.ts", "apps/docs/examples/setup/cloudflare.ts"],
  ),
];
