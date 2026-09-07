import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import type { ScaffoldDependencyName } from "./scaffold-catalog.js";

export interface ProviderDefinition {
  readonly adapter: string;
  readonly expression: string;
  readonly imports: readonly string[];
  readonly dependencies: readonly ScaffoldDependencyName[];
  readonly environment: readonly { readonly name: string; readonly definition: string }[];
  readonly warning?: { readonly code: string; readonly message: string };
}

const dockerWarning = {
  code: "docker-required",
  message: "Run `relkit local up` before using this local resource.",
};

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

export const providerDefinitions = {
  awsDefinition,
  connectedCloudflare,
  connectedRedis,
  connectedS3,
  dockerDefinition,
  dockerWarning,
};

export function defaultProviderProfile(
  capability: "cache" | "bucket" | "event" | "job" | "model",
  provider?: string,
  source?: "docker" | "connected" | "aws",
): string {
  if (capability === "model") return provider ?? "openai";
  if (provider === "cloudflare-kv" || provider === "cloudflare-r2") return provider;
  if (source === "connected") return capability === "cache" ? "redis" : "s3";
  if (source === "aws") return "aws";
  return "local";
}

export function requireAwsDeployment(available: boolean): void {
  if (!available) {
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.usage,
      "AWS resource scaffolding requires an existing AWS/Pulumi deployment.",
    );
  }
}
