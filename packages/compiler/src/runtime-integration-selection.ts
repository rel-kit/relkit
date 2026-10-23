/**
 * Resolves and deduplicates selected registrations against declared package
 * provenance. Requirement capabilities stay attached to their owning entry;
 * duplicate identities fail before any executable integration is imported.
 */
import { Effect } from "effect";
import type { RuntimeIntegrationPlanEntry } from "@relkit/contracts";
import type { RuntimeIntegrationPackage } from "./normalize-types.js";
import type { RuntimeIntegrationRequirement } from "./runtime-integration-telemetry.js";
import {
  RuntimeIntegrationPlanError,
  RuntimeIntegrationPlanFailure,
} from "./runtime-integration-errors.js";

/**
 * Resolves one required runtime registration to the owning package metadata.
 * @param requirement - Required runtime capability registration.
 * @param packages - Runtime integration packages declared by authoring imports.
 * @returns A lazy effect yielding owned registration metadata or RuntimeIntegrationPlanFailure.
 */
export const planEntryEffect = Effect.fnUntraced(function* (
  requirement: RuntimeIntegrationRequirement,
  packages: ReadonlyMap<string, RuntimeIntegrationPackage>,
): Effect.fn.Return<RuntimeIntegrationPlanEntry, RuntimeIntegrationPlanFailure> {
  const selected = packages.get(requirement.integrationId);
  if (selected === undefined)
    return yield* new RuntimeIntegrationPlanFailure({
      cause: new RuntimeIntegrationPlanError(
        "RELKIT_RUNTIME_INTEGRATION_PACKAGE_MISSING",
        requirement.integrationId,
        `Runtime integration package metadata is missing for "${requirement.integrationId}".`,
      ),
    });
  const matches = selected.registrations.some(
    (entry) =>
      entry.capability === requirement.capability &&
      entry.adapterId === requirement.adapterId &&
      entry.protocolVersion === requirement.protocolVersion,
  );
  if (!matches)
    return yield* new RuntimeIntegrationPlanFailure({
      cause: new RuntimeIntegrationPlanError(
        "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID",
        requirement.integrationId,
        `Package "${selected.packageName}" does not register ${requirement.capability}:${requirement.adapterId} protocol ${requirement.protocolVersion}.`,
      ),
    });
  return {
    ...requirement,
    packageName: selected.packageName,
    packageVersion: selected.packageVersion,
    exportName: selected.exportName,
    ...(selected.requirements === undefined
      ? {}
      : {
          requirements: selected.requirements.filter((entry) =>
            entry.capabilities.includes(requirement.capability),
          ),
        }),
  };
});

/**
 * Indexes integration packages while rejecting conflicting ownership.
 * @param packages - Runtime integration packages declared by authoring imports.
 * @returns A lazy effect yielding the ownership index or RuntimeIntegrationPlanFailure.
 */
export const packageMapEffect = Effect.fnUntraced(function* (
  packages: readonly RuntimeIntegrationPackage[],
) {
  const result = new Map<string, RuntimeIntegrationPackage>();
  for (const entry of packages) {
    const existing = result.get(entry.integrationId);
    if (existing !== undefined && packageKey(existing) !== packageKey(entry))
      return yield* new RuntimeIntegrationPlanFailure({
        cause: new RuntimeIntegrationPlanError(
          "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID",
          entry.integrationId,
          `Integration ID "${entry.integrationId}" is owned by multiple packages.`,
        ),
      });
    result.set(entry.integrationId, entry);
  }
  return result;
});

/**
 * Rejects runtime registrations owned by multiple integrations.
 * @param entries - Ordered entries to validate or index.
 * @returns A lazy effect rejecting conflicting registrations with RuntimeIntegrationPlanFailure.
 */
export const assertUniqueRegistrationsEffect = Effect.fnUntraced(function* (
  entries: readonly RuntimeIntegrationPlanEntry[],
) {
  const owners = new Map<string, RuntimeIntegrationPlanEntry>();
  for (const entry of entries) {
    const key = `${entry.capability}\0${entry.adapterId}`;
    const existing = owners.get(key);
    if (existing !== undefined)
      return yield* new RuntimeIntegrationPlanFailure({
        cause: new RuntimeIntegrationPlanError(
          "RELKIT_RUNTIME_INTEGRATION_REGISTRATION_DUPLICATE",
          entry.integrationId,
          `Runtime registration ${entry.capability}:${entry.adapterId} is provided by both "${existing.integrationId}" and "${entry.integrationId}".`,
        ),
      });
    owners.set(key, entry);
  }
});

/**
 * Serializes package metadata for ownership equality checks.
 * @param entry - Validated entry to project.
 * @returns Stable serialized package ownership metadata.
 */
function packageKey(entry: RuntimeIntegrationPackage): string {
  return JSON.stringify(entry);
}

/**
 * Creates a stable runtime registration ordering key.
 * @param entry - Validated entry to project.
 * @returns The runtime registration's stable ordering key.
 */
export function entryKey(entry: RuntimeIntegrationPlanEntry): string {
  return [
    entry.capability,
    entry.adapterId,
    entry.integrationId,
    entry.protocolVersion,
    entry.packageName,
    entry.packageVersion,
    entry.exportName,
  ].join("\0");
}
