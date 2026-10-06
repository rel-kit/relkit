import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";

import { providerDefinitions, type ProviderDefinition } from "./provider-planning-definitions.js";

/**
 * Reexports the shared pure provider constructors used by profile selection.
 */
export const { awsDefinition, connectedCloudflare, connectedRedis, connectedS3, dockerDefinition } =
  providerDefinitions;

/**
 * Selects the source definition for a requested provider capability.
 * @param capability - Requested provider capability.
 * @param options - Explicit request options or declared prompt choices.
 * @returns The local event/job or requested cache/bucket provider definition.
 */
export function definitionFor(
  capability: ProviderCapability,
  options: EnsureProfileOptions,
): ProviderDefinition {
  if (capability === "event" || capability === "job") return localDefinition(capability);
  if (capability === "cache") return cacheDefinition(options);
  return bucketDefinition(options);
}

/**
 * Builds a local in-process event or job provider definition.
 * @param capability - Requested provider capability.
 * @returns The local adapter constructor source, import and dependency.
 */
export function localDefinition(capability: "event" | "job"): ProviderDefinition {
  return {
    adapter: capability === "event" ? "localEvent" : "localJob",
    expression: capability === "event" ? "localEvent()" : "localJob()",
    imports: [
      `import { ${capability === "event" ? "localEvent" : "localJob"} } from "@relkit/local";`,
    ],
    dependencies: ["@relkit/local"],
    environment: [],
  };
}

/**
 * Selects cache source using explicit provider/source choices and local defaults.
 * @param options - Explicit request options or declared prompt choices.
 * @returns The Redis or Cloudflare KV provider definition; unsupported pairings raise usage errors.
 */
export function cacheDefinition(options: EnsureProfileOptions): ProviderDefinition {
  const provider = options.provider ?? "redis";
  const source = options.source ?? "docker";
  if (provider === "cloudflare-kv") {
    if (source !== "connected") usage("Cloudflare KV supports only --source connected.");
    return connectedCloudflare("kv");
  }
  if (source === "aws") return awsDefinition("redis", 'aws(redis(), { engine: "valkey" })');
  if (source === "connected") return connectedRedis();
  return dockerDefinition("redis", "docker(redis())");
}

/**
 * Selects bucket source using explicit provider/source choices and local defaults.
 * @param options - Explicit request options or declared prompt choices.
 * @returns The S3 or Cloudflare R2 provider definition; unsupported pairings raise usage errors.
 */
export function bucketDefinition(options: EnsureProfileOptions): ProviderDefinition {
  const provider = options.provider ?? "s3";
  const source = options.source ?? "docker";
  if (provider === "cloudflare-r2") {
    if (source !== "connected") usage("Cloudflare R2 supports only --source connected.");
    return connectedCloudflare("r2");
  }
  if (source === "aws") return awsDefinition("s3", "aws(s3(), { versioning: true })");
  if (source === "connected") return connectedS3();
  return dockerDefinition("s3", "docker(s3())");
}

/**
 * Rejects unsupported or incomplete scaffold arguments.
 * @param message - Diagnostic explaining the unsupported arguments.
 * @returns No value; throws AddScaffoldError with RELKIT_ADD_USAGE.
 */
export function usage(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.usage, message);
}

/**
 * Checks whether a discovered profile matches the requested adapter.
 * @param existing - Existing authored declaration or adapter identity.
 * @param requested - Explicitly requested declaration or adapter identity.
 * @returns Whether exact adapter identities match, including discovered Docker-wrapped forms.
 */
export function sameProviderAdapter(existing: string, requested: string): boolean {
  return requested === "docker"
    ? existing === "docker" || existing.startsWith("docker(")
    : existing === requested;
}

import type { ProviderCapability, EnsureProfileOptions } from "./provider-planning.types.js";
