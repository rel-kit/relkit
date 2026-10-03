import { assertJobsAdapterRuntime, isJobsAdapterRuntime } from "@relkit/jobs/adapter";
import { ProviderBindingResolutionError, type RuntimeProviderRegistration } from "@relkit/provider";
import { resolveProviderBindingConfiguration } from "./provider-binding-resolution.js";
import {
  ProviderRegistryError,
  type AcquiredProvider,
  type ProviderRegistryErrorCode,
  type ProviderRegistryOptions,
  type ProviderRequirement,
} from "./provider-registry-types.js";
import { optional } from "./provider-registry-validation.js";

/** Check that a constructed provider exposes its required runtime capability.
 * @returns Nothing; invalid native capability values throw ProviderRegistryError.
 * @param value - Native value being validated or projected.
 * @param requirement - Verified logical-resource provider requirement.
 */
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

/** Resolve a requirement's explicit connection configuration.
 * @returns Frozen behavior and explicitly resolved connection values.
 * @param requirement - Verified logical-resource provider requirement.
 * @param options - Explicit configuration and dependencies for this operation.
 */
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

/** Call the selected native provider factory with validated generation configuration.
 * @returns The native provider factory's generation result.
 * @param registration - Validated provider or schedule registration.
 * @param requirement - Verified logical-resource provider requirement.
 * @param configuration - Resolved explicit connection configuration.
 * @param options - Explicit configuration and dependencies for this operation.
 */
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

/** Await native provider readiness with cancellation support.
 * @returns A Promise completing after readiness or rejecting on readiness failure/cancellation.
 * @param generation - Acquired native provider generation.
 * @param requirement - Verified logical-resource provider requirement.
 * @param signal - Caller cancellation signal.
 */
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

/** Release acquired compatibility providers in reverse acquisition order.
 * @returns A Promise completing after all providers have been released in reverse order.
 * @param acquired - Acquired providers in construction order.
 */
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

/** Reject malformed generation or graph configuration before startup.
 * @returns Nothing; invalid startup inputs throw safe provider diagnostics.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function validateOptions(options: ProviderRegistryOptions): void {
  if (options.generationId.trim() === "")
    throw issue("RELKIT_PROVIDER_METADATA_INVALID", undefined, "Generation ID is required.");
  if (options.signal?.aborted)
    throw issue("RELKIT_PROVIDER_ABORTED", undefined, "Provider startup was aborted.");
}

/** Construct a safe public provider issue without native exception details.
 * @returns A ProviderRegistryError containing safe immutable diagnostic data.
 * @param code - Bounded public provider diagnostic code.
 * @param requirement - Verified logical-resource provider requirement.
 * @param message - Safe compatibility diagnostic.
 */
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
