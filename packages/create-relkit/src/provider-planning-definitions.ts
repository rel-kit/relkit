import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import type { ScaffoldDependencyName } from "./scaffold-catalog.js";

/**
 * Provider constructor source, imports, dependencies and environment declarations.
 */
export interface ProviderDefinition {
  readonly adapter: string;
  readonly expression: string;
  readonly imports: readonly string[];
  readonly dependencies: readonly ScaffoldDependencyName[];
  readonly environment: readonly { readonly name: string; readonly definition: string }[];
  readonly warning?: { readonly code: string; readonly message: string };
}

/**
 * Next step for newly scaffolded Docker-backed resource profiles.
 */
const dockerWarning = {
  code: "docker-required",
  message: "Run `relkit local up` before using this local resource.",
};

/**
 * Builds source, imports and dependencies for a Docker-wrapped resource.
 * @param adapter - Underlying Redis or S3 resource adapter.
 * @param expression - Rendered Docker/resource constructor expression.
 * @returns The provider definition including the local Docker startup warning.
 */
function dockerDefinition(adapter: "redis" | "s3", expression: string): ProviderDefinition {
  return {
    adapter: "docker",
    expression,
    imports: [
      `import { docker } from "@relkit/docker";`,
      `import { ${adapter} } from "@relkit/${adapter}";`,
    ],
    dependencies: ["@relkit/docker", "@relkit/local", `@relkit/${adapter}`],
    environment: [],
    warning: dockerWarning,
  } as ProviderDefinition;
}

/**
 * Builds source, imports and dependencies for an AWS-wrapped resource.
 * @param adapter - Underlying Redis or S3 resource adapter.
 * @param expression - Rendered AWS/resource constructor expression.
 * @returns The provider definition using AWS and its underlying resource adapter.
 */
function awsDefinition(adapter: "redis" | "s3", expression: string): ProviderDefinition {
  return {
    adapter: "aws",
    expression,
    imports: [
      `import { aws } from "@relkit/aws";`,
      `import { ${adapter} } from "@relkit/${adapter}";`,
    ],
    dependencies: ["@relkit/aws", `@relkit/${adapter}`],
    environment: [],
  } as ProviderDefinition;
}

/**
 * Builds an externally connected Redis profile definition.
 * @returns Redis constructor source and the required REDIS_URL secret declaration.
 */
function connectedRedis(): ProviderDefinition {
  return {
    adapter: "redis",
    expression: `redis({ url: binding.secret("REDIS_URL") })`,
    imports: [
      `import { env as binding } from "@relkit/app/config";`,
      `import { redis } from "@relkit/redis";`,
    ],
    dependencies: ["@relkit/redis"],
    environment: [{ name: "REDIS_URL", definition: "env.secret()" }],
  };
}

/**
 * Builds an externally connected S3 profile definition.
 * @returns S3 constructor source and endpoint, bucket, region and credential declarations.
 */
function connectedS3(): ProviderDefinition {
  return {
    adapter: "s3",
    expression: `s3({ endpoint: binding.url("S3_ENDPOINT"), bucketName: binding.string("S3_BUCKET"), region: binding.string("S3_REGION"), credentials: { accessKeyId: binding.secret("S3_ACCESS_KEY_ID"), secretAccessKey: binding.secret("S3_SECRET_ACCESS_KEY") } })`,
    imports: [
      `import { env as binding } from "@relkit/app/config";`,
      `import { s3 } from "@relkit/s3";`,
    ],
    dependencies: ["@relkit/s3"],
    environment: [
      { name: "S3_ENDPOINT", definition: "env.url()" },
      { name: "S3_BUCKET", definition: "env.string()" },
      { name: "S3_REGION", definition: "env.string()" },
      { name: "S3_ACCESS_KEY_ID", definition: "env.secret()" },
      { name: "S3_SECRET_ACCESS_KEY", definition: "env.secret()" },
    ],
  };
}

/**
 * Builds an externally connected Cloudflare KV or R2 definition.
 * @param adapter - Cloudflare KV or R2 resource adapter.
 * @returns The selected Cloudflare adapter source and required environment declarations.
 */
function connectedCloudflare(adapter: "kv" | "r2"): ProviderDefinition {
  const r2 = adapter === "r2";
  return {
    adapter,
    expression: r2
      ? `r2({ accountId: binding.string("CLOUDFLARE_ACCOUNT_ID"), bucketName: binding.string("CLOUDFLARE_R2_BUCKET"), credentials: { accessKeyId: binding.secret("CLOUDFLARE_R2_ACCESS_KEY_ID"), secretAccessKey: binding.secret("CLOUDFLARE_R2_SECRET_ACCESS_KEY") } })`
      : `kv({ accountId: binding.string("CLOUDFLARE_ACCOUNT_ID"), namespaceId: binding.string("CLOUDFLARE_KV_NAMESPACE_ID"), apiToken: binding.secret("CLOUDFLARE_API_TOKEN") })`,
    imports: [
      `import { env as binding } from "@relkit/app/config";`,
      `import { ${adapter} } from "@relkit/cloudflare";`,
    ],
    dependencies: ["@relkit/cloudflare"],
    environment: r2
      ? [
          { name: "CLOUDFLARE_ACCOUNT_ID", definition: "env.string()" },
          { name: "CLOUDFLARE_R2_BUCKET", definition: "env.string()" },
          { name: "CLOUDFLARE_R2_ACCESS_KEY_ID", definition: "env.secret()" },
          { name: "CLOUDFLARE_R2_SECRET_ACCESS_KEY", definition: "env.secret()" },
        ]
      : [
          { name: "CLOUDFLARE_ACCOUNT_ID", definition: "env.string()" },
          { name: "CLOUDFLARE_KV_NAMESPACE_ID", definition: "env.string()" },
          { name: "CLOUDFLARE_API_TOKEN", definition: "env.secret()" },
        ],
  };
}

/**
 * Pure constructors and warnings shared by provider profile selection.
 */
export const providerDefinitions = {
  awsDefinition,
  connectedCloudflare,
  connectedRedis,
  connectedS3,
  dockerDefinition,
  dockerWarning,
};

/**
 * Chooses the conventional profile name for a resource selection.
 * @param capability - Requested provider capability.
 * @param provider - Requested provider adapter.
 * @param source - Requested infrastructure source.
 * @returns The Cloudflare/connected/AWS profile name, otherwise local.
 */
export function defaultProviderProfile(
  capability: "cache" | "bucket" | "event" | "job",
  provider?: string,
  source?: "docker" | "connected" | "aws",
): string {
  if (provider === "cloudflare-kv" || provider === "cloudflare-r2") return provider;
  if (source === "connected") return capability === "cache" ? "redis" : "s3";
  if (source === "aws") return "aws";
  return "local";
}

/**
 * Requires an existing AWS/Pulumi deployment before planning AWS resources.
 * @param available - Whether declaration discovery found AWS/Pulumi deployment support.
 * @returns Completion when deployment exists; otherwise a usage error is thrown.
 */
export function requireAwsDeployment(available: boolean): void {
  if (!available) {
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.usage,
      "AWS resource scaffolding requires an existing AWS/Pulumi deployment.",
    );
  }
}
