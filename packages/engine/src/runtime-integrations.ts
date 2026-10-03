import {
  assertRuntimeIntegrationPlanVersion,
  isStableId,
  type RuntimeIntegrationModuleMetadata,
  type RuntimeIntegrationPlan,
  type RuntimeIntegrationPlanEntry,
} from "@relkit/contracts";
import type { LoadedRuntimeIntegrationModule } from "./runtime-integrations.types.js";
export type { LoadedRuntimeIntegrationModule } from "./runtime-integrations.types.js";

/** Stable public failure for invalid runtime-integration metadata. */
export class RuntimeIntegrationMetadataError extends TypeError {
  readonly code = "RELKIT_RUNTIME_INTEGRATION_METADATA_INVALID" as const;

  /** Retain the stable public diagnostic fields for this compatibility error.
   * @param message - Safe compatibility diagnostic.
   * @returns undefined
   */
  constructor(message: string) {
    super(message);
    this.name = "RuntimeIntegrationMetadataError";
  }
}

/** Verify explicitly loaded integration exports before provider construction.
 * @returns Nothing; invalid module metadata throws RuntimeIntegrationMetadataError.
 * @param plan - Verified registration or runtime integration plan.
 * @param modules - Explicitly loaded runtime integration exports.
 */
export function assertRuntimeIntegrationModules(
  plan: RuntimeIntegrationPlan,
  modules: readonly LoadedRuntimeIntegrationModule[],
): void {
  assertRuntimeIntegrationPlanVersion(plan);
  const expected = groupPlan(plan.integrations);
  const loaded = new Set<string>();
  for (const entry of modules) {
    const key = moduleKey(entry);
    const planned = expected.get(key);
    if (planned === undefined || loaded.has(key))
      fail(`Unexpected or duplicate module ${label(entry)}.`);
    loaded.add(key);
    const metadata = metadataOf(entry.module);
    if (metadata === undefined) fail(`Module ${label(entry)} does not report valid metadata.`);
    const integrationIds = new Set(planned.map((item) => item.integrationId));
    if (integrationIds.size !== 1 || !integrationIds.has(metadata.integrationId))
      fail(`Module ${label(entry)} reports integration ${JSON.stringify(metadata.integrationId)}.`);
    const registrations = new Set(metadata.registrations.map(registrationKey));
    if (registrations.size !== metadata.registrations.length)
      fail(`Module ${label(entry)} reports duplicate registrations.`);
    for (const item of planned)
      if (!registrations.has(registrationKey(item)))
        fail(`Module ${label(entry)} does not register ${registrationLabel(item)}.`);
  }
  for (const [key, entries] of expected)
    if (!loaded.has(key)) fail(`Planned module ${label(entries[0]!)} was not loaded.`);
}

/** Group runtime integration plan entries by exact module identity.
 * @returns group runtime integration plan entries by exact module identity.
 * @param entries - Normalized manifest or integration entries.
 */
function groupPlan(
  entries: readonly RuntimeIntegrationPlanEntry[],
): ReadonlyMap<string, readonly RuntimeIntegrationPlanEntry[]> {
  const result = new Map<string, RuntimeIntegrationPlanEntry[]>();
  for (const entry of entries) {
    const key = moduleKey(entry);
    const group = result.get(key) ?? [];
    group.push(entry);
    result.set(key, group);
  }
  return result;
}

/** Read a valid runtime-integration export without coercing native metadata.
 * @returns read a valid runtime-integration export without coercing native metadata.
 * @param value - Native value being validated or projected.
 */
function metadataOf(value: unknown): RuntimeIntegrationModuleMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const metadata = value.runtimeIntegration;
  if (
    !isRecord(metadata) ||
    metadata.kind !== "runtime-integration" ||
    !isStableId(metadata.integrationId) ||
    !Array.isArray(metadata.registrations) ||
    !metadata.registrations.every(isRegistration)
  )
    return undefined;
  return metadata as unknown as RuntimeIntegrationModuleMetadata;
}

/** Recognize provider registration metadata before indexing it.
 * @returns Whether the native value satisfies this guard.
 * @param value - Native value being validated or projected.
 */
function isRegistration(value: unknown): boolean {
  return (
    isRecord(value) &&
    isStableId(value.capability) &&
    isStableId(value.adapterId) &&
    Number.isSafeInteger(value.protocolVersion) &&
    Number(value.protocolVersion) > 0
  );
}

/** Build an exact package/version/export identity for module matching.
 * @returns build an exact package/version/export identity for module matching.
 * @param value - Native value being validated or projected.
 */
function moduleKey(value: {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
}): string {
  return `${value.packageName}\0${value.packageVersion}\0${value.exportName}`;
}

/** Build a deterministic runtime registration lookup key.
 * @returns build a deterministic runtime registration lookup key.
 * @param value - Native value being validated or projected.
 */
function registrationKey(value: {
  readonly capability: string;
  readonly adapterId: string;
  readonly protocolVersion: number;
}): string {
  return `${value.capability}\0${value.adapterId}\0${value.protocolVersion}`;
}

/** Format a safe runtime registration identity for diagnostics.
 * @returns format a safe runtime registration identity for diagnostics.
 * @param value - Native value being validated or projected.
 */
function registrationLabel(value: RuntimeIntegrationPlanEntry): string {
  return `${value.capability}:${value.adapterId} protocol ${value.protocolVersion}`;
}

/** Format a safe integration identity for diagnostics.
 * @returns format a safe integration identity for diagnostics.
 * @param value - Native value being validated or projected.
 */
function label(value: {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
}): string {
  return `${JSON.stringify(value.packageName)}@${value.packageVersion} ${JSON.stringify(value.exportName)}`;
}

/** Reject invalid runtime integration metadata with its public compatibility error.
 * @returns Never; throws the stable compatibility error.
 * @param message - Safe compatibility diagnostic.
 */
function fail(message: string): never {
  throw new RuntimeIntegrationMetadataError(
    `${message} Rebuild with \`relkit build\` or reinstall the integration package.`,
  );
}

/** Recognize non-null object records before reading native fields.
 * @returns Whether the native value satisfies this guard.
 * @param value - Native value being validated or projected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
