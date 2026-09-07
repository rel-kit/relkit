import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import { normalizeArtifactName } from "./add-name.js";
import { PlanBuilder } from "./plan-builder.js";
import type { DiscoveredProfile } from "./project-discovery-types.js";
import {
  defaultProviderProfile,
  providerDefinitions,
  requireAwsDeployment,
  type ProviderDefinition,
} from "./provider-planning-definitions.js";
import { addFactoryObjectMember, addSourceImport } from "./source-edit.js";
const { awsDefinition, connectedCloudflare, connectedRedis, connectedS3, dockerDefinition } =
  providerDefinitions;

export type ProviderCapability = "cache" | "bucket" | "event" | "job" | "model";

export interface EnsureProfileOptions {
  readonly requested?: string | undefined;
  readonly provider?: string | undefined;
  readonly source?: "docker" | "connected" | "aws" | undefined;
  readonly modelId?: string | undefined;
}

export async function ensureProviderProfile(
  builder: PlanBuilder,
  capability: ProviderCapability,
  options: EnsureProfileOptions = {},
): Promise<string> {
  const profiles = builder.profiles.filter((item) => item.capability === capability);
  const explicitSource =
    options.provider !== undefined || options.source !== undefined || options.modelId !== undefined;
  if (options.requested) {
    const existing = profiles.find((item) => item.name === options.requested);
    if (existing && !explicitSource) return reuseProfile(builder, existing);
  } else if (!explicitSource) {
    const configured =
      profiles.find((item) => item.isDefault) ?? (profiles.length === 1 ? profiles[0] : undefined);
    if (configured) return reuseProfile(builder, configured);
  }
  const name = normalizeArtifactName(
    options.requested ?? defaultProviderProfile(capability, options.provider, options.source),
  ).fileStem;
  const definition = definitionFor(capability, options);
  const existing = profiles.find((item) => item.name === name);
  if (existing) {
    if (existing.adapter && existing.adapter !== definition.adapter) {
      usage(
        `Provider profile ${name} already uses ${existing.adapter}, not ${definition.adapter}.`,
      );
    }
    return reuseProfile(builder, existing);
  }
  if (options.source === "aws") requireAwsDeployment(builder.discovery.awsPulumiDeployment);
  for (const dependency of definition.dependencies) builder.dependency(dependency);
  for (const declaration of definition.imports) {
    await builder.update("relkit.config.ts", (source) =>
      addSourceImport(source, "relkit.config.ts", declaration),
    );
  }
  for (const environment of definition.environment) {
    await ensureEnvironment(builder, environment.name, environment.definition);
  }
  await builder.update("relkit.config.ts", (source) => {
    const path = profiles.length === 0 ? [] : [capability];
    const member =
      profiles.length === 0
        ? `${capability}: { ${JSON.stringify(name)}: ${definition.expression} }`
        : `${JSON.stringify(name)}: ${definition.expression}`;
    return addFactoryObjectMember(
      source,
      "relkit.config.ts",
      [builder.discovery.appFactory],
      path,
      profiles.length === 0 ? capability : name,
      member,
    );
  });
  if (!profiles.some((item) => item.isDefault)) {
    await builder.update("relkit.config.ts", (source) =>
      addFactoryObjectMember(
        source,
        "relkit.config.ts",
        [builder.discovery.appFactory],
        ["defaults"],
        capability,
        `${capability}: "${name}"`,
      ),
    );
  }
  if (definition.warning) builder.warning(definition.warning.code, definition.warning.message);
  if (definition.adapter === "docker") builder.nextStep("relkit local up");
  builder.registerProfile({
    capability,
    name,
    adapter: definition.adapter,
    isDefault: !profiles.some((item) => item.isDefault),
  });
  return name;
}

export async function ensureEnvironment(
  builder: PlanBuilder,
  name: string,
  definition: string,
  example = "",
): Promise<void> {
  const path = builder.discovery.envPath
    ? builder.relative(builder.discovery.envPath)
    : "relkit.config.ts";
  await builder.update(path, (source) =>
    addFactoryObjectMember(source, path, ["defineEnv"], [], name, `${name}: ${definition}`),
  );
  await builder.envExample(name, example);
}

function definitionFor(
  capability: ProviderCapability,
  options: EnsureProfileOptions,
): ProviderDefinition {
  if (capability === "event" || capability === "job") return localDefinition(capability);
  if (capability === "model") return modelDefinition(options);
  if (capability === "cache") return cacheDefinition(options);
  return bucketDefinition(options);
}

function localDefinition(capability: "event" | "job"): ProviderDefinition {
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

function modelDefinition(options: EnsureProfileOptions): ProviderDefinition {
  const provider = options.provider;
  const modelId = options.modelId;
  if ((provider !== "openai" && provider !== "anthropic") || !modelId) {
    usage("A new model profile requires --model-provider and --model-id.");
  }
  const environment = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  return {
    adapter: "aiSdk",
    expression: `aiSdk({ provider: "${provider}", defaultModel: "${modelId}", apiKey: binding.secret("${environment}") })`,
    imports: [
      `import { aiSdk } from "@relkit/ai-sdk";`,
      `import { env as binding } from "@relkit/app/config";`,
    ],
    dependencies: ["@relkit/ai-sdk"],
    environment: [{ name: environment, definition: "env.secret()" }],
    warning: {
      code: "model-secret-required",
      message: `Set ${environment} in .env before starting or restarting the server; the model profile requires it at startup.`,
    },
  };
}

function cacheDefinition(options: EnsureProfileOptions): ProviderDefinition {
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

function bucketDefinition(options: EnsureProfileOptions): ProviderDefinition {
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

function usage(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.usage, message);
}

function reuseProfile(builder: PlanBuilder, profile: DiscoveredProfile): string {
  if (profile.adapter === "docker") {
    const warning = providerDefinitions.dockerWarning;
    builder.warning(warning.code, warning.message);
    builder.nextStep("relkit local up");
  }
  return profile.name;
}
