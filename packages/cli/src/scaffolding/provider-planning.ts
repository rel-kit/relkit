/** Plans provider declarations and environment changes for the selected feature, preserving existing profile names and incompatible-provider diagnostics. */

import { configureProviderProfile } from "./provider-profile-publication.js";
import { ensureEnvironmentEffect } from "./provider-environment.js";
export { ensureEnvironmentEffect } from "./provider-environment.js";
import { Effect } from "effect";

import { observeExecution } from "@relkit/contracts/operation";

import { GeneratorFileSystem } from "create-relkit/internal/generator-filesystem";

import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
} from "create-relkit/internal/generator-errors";

import { runGeneratorPromise } from "create-relkit/internal/generator-runtime";

import { normalizeArtifactName } from "./add-name.js";

import { PlanBuilder } from "./plan-builder.js";

import type { DiscoveredProfile } from "./project-discovery-types.js";

import { defaultProviderProfile, providerDefinitions } from "./provider-planning-definitions.js";

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
    yield* configureProviderProfile(
      builder,
      capability,
      options,
      configCapability,
      profiles,
      name,
      definition,
    );
    return name;
  },
  (effect) =>
    observeExecution("generator", "planning.ensureProviderProfile", scaffoldErrors(effect)),
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
