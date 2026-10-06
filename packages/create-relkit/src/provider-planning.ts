import { Effect } from "effect";

import { observeExecution } from "@relkit/contracts/operation";

import { GeneratorFileSystem } from "./generator-filesystem.js";

import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
} from "./generator-errors.js";

import { runGeneratorPromise } from "./generator-runtime.js";

import { normalizeArtifactName } from "./add-name.js";

import { PlanBuilder } from "./plan-builder.js";

import type { DiscoveredProfile } from "./project-discovery-types.js";

import {
  defaultProviderProfile,
  providerDefinitions,
  requireAwsDeployment,
} from "./provider-planning-definitions.js";

import { addFactoryObjectMember, addSourceImport } from "./source-edit.js";

/**
 * Plans ensure provider profile through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param capability - Requested provider capability.
 * @param options - Explicit options retaining existing defaults.
 * @returns The reused or newly planned provider profile name.
 */
export const ensureProviderProfileEffect = Effect.fn("Scaffold.ensureProviderProfile")(
  function* (
    builder: PlanBuilder,
    capability: ProviderCapability,
    options: EnsureProfileOptions = {},
  ): Effect.fn.Return<string, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem> {
    const configCapability = capability === "job" && options.legacy !== true ? "jobs" : capability;
    const profiles = builder.profiles.filter((item) => item.capability === capability);
    const explicitSource = options.provider !== undefined || options.source !== undefined;
    if (options.requested) {
      const existing = profiles.find((item) => item.name === options.requested);
      if (existing && !explicitSource) return yield* reuseProfileEffect(builder, existing);
    } else if (!explicitSource) {
      const configured =
        profiles.find((item) => item.isDefault) ??
        (profiles.length === 1 ? profiles[0] : undefined);
      if (configured) return yield* reuseProfileEffect(builder, configured);
    }
    const name = normalizeArtifactName(
      options.requested ?? defaultProviderProfile(capability, options.provider, options.source),
    ).fileStem;
    const definition = definitionFor(capability, options);
    const existing = profiles.find((item) => item.name === name);
    if (existing) {
      if (existing.adapter && !sameProviderAdapter(existing.adapter, definition.adapter)) {
        usage(
          `Provider profile ${name} already uses ${existing.adapter}, not ${definition.adapter}.`,
        );
      }
      return yield* reuseProfileEffect(builder, existing);
    }
    if (options.source === "aws") requireAwsDeployment(builder.discovery.awsPulumiDeployment);
    for (const dependency of definition.dependencies) yield* builder.dependencyEffect(dependency);
    for (const declaration of definition.imports) {
      yield* builder.updateEffect("relkit.config.ts", (source) =>
        addSourceImport(source, "relkit.config.ts", declaration),
      );
    }
    for (const environment of definition.environment) {
      yield* ensureEnvironmentEffect(builder, environment.name, environment.definition);
    }
    yield* builder.updateEffect("relkit.config.ts", (source) => {
      const path = profiles.length === 0 ? [] : [configCapability];
      const member =
        profiles.length === 0
          ? `${configCapability}: { ${JSON.stringify(name)}: ${definition.expression} }`
          : `${JSON.stringify(name)}: ${definition.expression}`;
      return addFactoryObjectMember(
        source,
        "relkit.config.ts",
        [builder.discovery.appFactory],
        path,
        profiles.length === 0 ? configCapability : name,
        member,
      );
    });
    if (!profiles.some((item) => item.isDefault)) {
      yield* builder.updateEffect("relkit.config.ts", (source) =>
        addFactoryObjectMember(
          source,
          "relkit.config.ts",
          [builder.discovery.appFactory],
          ["defaults"],
          configCapability,
          `${configCapability}: "${name}"`,
        ),
      );
    }
    if (definition.warning)
      yield* builder.warningEffect(definition.warning.code, definition.warning.message);
    if (definition.adapter === "docker") yield* builder.nextStepEffect("relkit local up");
    yield* builder.registerProfileEffect({
      capability,
      name,
      adapter: definition.adapter,
      isDefault: !profiles.some((item) => item.isDefault),
    });
    return name;
  },
  (effect) =>
    observeExecution("generator", "planning.ensureProviderProfile", scaffoldErrors(effect)),
);

/**
 * Plans ensure environment through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param name - Authored name or declaration key.
 * @param definition - Rendered environment schema expression.
 * @param example - Example value included only when adding a declaration.
 * @returns Completion after the environment schema and missing example value are planned.
 */
export const ensureEnvironmentEffect = Effect.fn("Scaffold.ensureEnvironment")(
  function* (
    builder: PlanBuilder,
    name: string,
    definition: string,
    example = "",
  ): Effect.fn.Return<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem> {
    const path = builder.discovery.envPath
      ? builder.relative(builder.discovery.envPath)
      : "relkit.config.ts";
    yield* builder.updateEffect(path, (source) =>
      addFactoryObjectMember(source, path, ["defineEnv"], [], name, `${name}: ${definition}`),
    );
    yield* builder.envExampleEffect(name, example);
  },
  (effect) => observeExecution("generator", "planning.ensureEnvironment", scaffoldErrors(effect)),
);

/**
 * Composes reuse Profile with explicit services, typed failures and owned resource lifetime.
 * @param builder - Per-request planning owner.
 * @param profile - Selected provider profile.
 * @returns The existing profile name after required Docker warnings/next steps are retained.
 */
const reuseProfileEffect = Effect.fn("Scaffold.reuseProfile")(
  function* (builder: PlanBuilder, profile: DiscoveredProfile) {
    if (profile.adapter?.startsWith("docker")) {
      const warning = providerDefinitions.dockerWarning;
      yield* builder.warningEffect(warning.code, warning.message);
      yield* builder.nextStepEffect("relkit local up");
    }
    return profile.name;
  },
  (effect) => observeExecution("generator", "planning.reuseProfile", effect),
);

/**
 * Preserves the ensureProviderProfile Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param capability - Requested provider capability.
 * @param options - Explicit options retaining existing defaults.
 * @returns The chosen existing or newly planned provider profile name.
 */
export function ensureProviderProfile(
  builder: PlanBuilder,
  capability: ProviderCapability,
  options: EnsureProfileOptions = {},
): Promise<string> {
  return runGeneratorPromise(ensureProviderProfileEffect(builder, capability, options));
}

/**
 * Preserves the ensureEnvironment Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param name - Authored name or declaration key.
 * @param definition - Rendered environment schema expression.
 * @param example - Example value included only when adding a declaration.
 * @returns Completion after the existing contract has been applied.
 */
export function ensureEnvironment(
  builder: PlanBuilder,
  name: string,
  definition: string,
  example = "",
): Promise<void> {
  return runGeneratorPromise(ensureEnvironmentEffect(builder, name, definition, example));
}

import { definitionFor, usage, sameProviderAdapter } from "./provider-profile-definition.js";

import type { ProviderCapability, EnsureProfileOptions } from "./provider-planning.types.js";
export type { ProviderCapability, EnsureProfileOptions } from "./provider-planning.types.js";
