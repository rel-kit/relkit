import { ProviderBindingResolutionError, type RuntimeProviderRegistration } from "@relkit/provider";
import { assertJobsAdapterRuntime, isJobsAdapterRuntime } from "@relkit/jobs/adapter";
import { resolveProviderBindingConfiguration } from "./provider-binding-resolution.js";
import { optional, key } from "./provider-registry-validation.js";
import {
  ProviderRegistryError,
  type AcquiredProvider,
  type ProviderHandle,
  type ProviderRegistryErrorCode,
  type ProviderRegistryOptions,
  type ProviderRequirement,
} from "./provider-registry-types.js";

export function validateRuntimeValue(value: unknown, requirement: ProviderRequirement): void {
  if (requirement.executionModel === "task") {
    try {
      assertJobsAdapterRuntime(value);
    } catch (error) {
      throw issue(
        "RELKIT_PROVIDER_RUNTIME_INVALID",
        requirement,
        error instanceof Error ? error.message : "Task jobs provider is not a native jobs adapter.",
      );
    }
    return;
  }
  if (requirement.executionModel === "legacy-function" && isJobsAdapterRuntime(value))
    throw issue(
      "RELKIT_PROVIDER_RUNTIME_INVALID",
      requirement,
      `Legacy job binding "${requirement.bindingId}" cannot use a task jobs adapter.`,
    );
}

export function configurationFor(
  requirement: ProviderRequirement,
  options: ProviderRegistryOptions,
) {
  try {
    return resolveProviderBindingConfiguration(requirement.binding, {
      ...optional("values", options.bindingValues),
      ...optional("local", options.localBindingValues),
      ...optional("infrastructure", options.infrastructureBindingValues),
    });
  } catch (cause) {
    if (cause instanceof ProviderBindingResolutionError)
      throw issue("RELKIT_PROVIDER_CONFIGURATION_INVALID", requirement, cause.message);
    throw cause;
  }
}

export async function create(
  registration: RuntimeProviderRegistration,
  requirement: ProviderRequirement,
  configuration: ReturnType<typeof configurationFor>,
  options: ProviderRegistryOptions,
) {
  try {
    return await registration.create({
      generationId: options.generationId,
      bindingId: requirement.bindingId,
      capability: requirement.capability,
      profile: requirement.profile,
      ...(requirement.executionModel === undefined
        ? {}
        : { executionModel: requirement.executionModel }),
      ...configuration,
      ...optional("signal", options.signal),
    });
  } catch {
    throw issue(
      "RELKIT_PROVIDER_CONSTRUCTION_FAILED",
      requirement,
      `Provider construction failed for binding "${requirement.bindingId}".`,
    );
  }
}

export async function ready(
  generation: Awaited<ReturnType<RuntimeProviderRegistration["create"]>>,
  requirement: ProviderRequirement,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (generation === null || typeof generation !== "object" || generation.value === undefined)
    throw issue(
      "RELKIT_PROVIDER_CONSTRUCTION_FAILED",
      requirement,
      `Provider integration returned no value for binding "${requirement.bindingId}".`,
    );
  if (signal?.aborted)
    throw issue("RELKIT_PROVIDER_ABORTED", requirement, "Provider startup was aborted.");
  try {
    await generation.ready?.();
    await generation.readiness?.();
  } catch {
    throw issue(
      "RELKIT_PROVIDER_READINESS_FAILED",
      requirement,
      `Provider readiness failed for binding "${requirement.bindingId}".`,
    );
  }
  if (signal?.aborted)
    throw issue("RELKIT_PROVIDER_ABORTED", requirement, "Provider startup was aborted.");
}

export async function releaseAll(acquired: readonly AcquiredProvider[]): Promise<void> {
  let failed = false;
  for (const { generation } of [...acquired].reverse()) {
    try {
      if (generation.release) await generation.release();
      else await generation.dispose?.();
    } catch {
      failed = true;
    }
  }
  if (failed) throw issue("RELKIT_PROVIDER_RELEASE_FAILED", undefined, "Provider release failed.");
}

export function validateOptions(options: ProviderRegistryOptions): void {
  if (options.generationId.trim() === "")
    throw issue("RELKIT_PROVIDER_METADATA_INVALID", undefined, "Generation ID is required.");
  if (options.signal?.aborted)
    throw issue("RELKIT_PROVIDER_ABORTED", undefined, "Provider startup was aborted.");
}

export function issue(
  code: ProviderRegistryErrorCode,
  requirement: ProviderRequirement | undefined,
  message: string,
): ProviderRegistryError {
  return new ProviderRegistryError([
    {
      code,
      message,
      ...(requirement === undefined
        ? {}
        : {
            capability: requirement.capability,
            profile: requirement.profile,
            source: requirement.source,
          }),
    },
  ]);
}
