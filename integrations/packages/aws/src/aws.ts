import {
  defineInfrastructureProviderSource,
  defineIntegrationReference,
  defineProviderAccess,
  type InfrastructureProviderSource,
  type ProviderAdapter,
  type ProviderCapability,
} from "@relkit/provider";

type S3Adapter = ProviderAdapter<ProviderCapability<"bucket">, "s3">;
type RedisAdapter = ProviderAdapter<ProviderCapability<"cache">, "redis">;
export type AwsAdapter = S3Adapter | RedisAdapter;

export interface AwsS3Options {
  readonly versioning?: boolean;
  readonly forceDestroy?: boolean;
}

export interface AwsRedisOptions {
  readonly engine?: "valkey" | "redis";
  readonly nodeType?: string;
  readonly replicas?: number;
}

export type AwsOptions<Adapter extends AwsAdapter> = Adapter extends S3Adapter
  ? AwsS3Options
  : AwsRedisOptions;

const integration = defineIntegrationReference("aws");

/**
 * Provisions a supported S3 or Redis adapter on AWS and grants only its workload access.
 *
 * @example
 * ```ts
 * import { aws } from "@relkit/aws";
 * import { s3 } from "@relkit/s3";
 * const receipts = aws(s3(), { versioning: true });
 * ```
 * @category Integrations
 * @since 0.2.0
 */
export function aws<const Adapter extends AwsAdapter>(
  adapter: Adapter,
  options: AwsOptions<Adapter> = {} as AwsOptions<Adapter>,
): InfrastructureProviderSource<Adapter> {
  const capability = adapter.capability.id;
  if (capability === "bucket" && adapter.adapterId === "s3") {
    assertS3Options(options);
    return defineInfrastructureProviderSource(
      adapter,
      integration,
      s3Configuration(options),
      defineProviderAccess({
        kind: "iam",
        actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      }),
    );
  }
  if (capability === "cache" && adapter.adapterId === "redis") {
    assertRedisOptions(options);
    return defineInfrastructureProviderSource(
      adapter,
      integration,
      redisConfiguration(options),
      defineProviderAccess({ kind: "network", port: 6379 }),
    );
  }
  throw new TypeError(`AWS does not support ${capability}:${adapter.adapterId}`);
}

function s3Configuration(options: AwsS3Options): Record<string, boolean> {
  return {
    ...(options.versioning === undefined ? {} : { versioning: options.versioning }),
    ...(options.forceDestroy === undefined ? {} : { forceDestroy: options.forceDestroy }),
  };
}

function redisConfiguration(options: AwsRedisOptions): Record<string, string | number> {
  return {
    ...(options.engine === undefined ? {} : { engine: options.engine }),
    ...(options.nodeType === undefined ? {} : { nodeType: options.nodeType }),
    ...(options.replicas === undefined ? {} : { replicas: options.replicas }),
  };
}

function assertS3Options(value: unknown): asserts value is AwsS3Options {
  const options = record(value, "AWS S3 options");
  assertKeys(options, ["versioning", "forceDestroy"]);
  for (const name of ["versioning", "forceDestroy"])
    if (options[name] !== undefined && typeof options[name] !== "boolean")
      throw new TypeError(`AWS S3 ${name} must be a boolean`);
}

function assertRedisOptions(value: unknown): asserts value is AwsRedisOptions {
  const options = record(value, "AWS Redis options");
  assertKeys(options, ["engine", "nodeType", "replicas"]);
  if (options.engine !== undefined && options.engine !== "valkey" && options.engine !== "redis")
    throw new TypeError('AWS Redis engine must be "valkey" or "redis"');
  if (options.nodeType !== undefined && !/^cache\.[a-z0-9.-]+$/i.test(String(options.nodeType)))
    throw new TypeError("AWS Redis nodeType is invalid");
  if (
    options.replicas !== undefined &&
    (!Number.isSafeInteger(options.replicas) ||
      Number(options.replicas) < 0 ||
      Number(options.replicas) > 5)
  )
    throw new RangeError("AWS Redis replicas must be between 0 and 5");
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new TypeError(`Unknown AWS option "${key}"`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}
