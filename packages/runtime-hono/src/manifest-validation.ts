import {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
  isRuntimeActivationFingerprint,
} from "@relkit/contracts";
import type { RuntimeHonoManifestErrorCode } from "./manifest-validation.types.js";
import type { RuntimeManifest } from "./materialize-routes.js";
export type { RuntimeHonoManifestErrorCode } from "./manifest-validation.types.js";

/** Manifest compatibility failure with an optional offending graph reference. */
export class RuntimeHonoManifestError extends Error {
  readonly referenceId?: string;

  /** Create a build validation failure without changing its public error identity.
   * @param code - Stable manifest failure classification.
   * @param message - Diagnostic identifying the stale or missing artifact.
   * @param referenceId - Optional graph node involved in the failure.
   */
  constructor(
    readonly code: RuntimeHonoManifestErrorCode,
    message: string,
    referenceId?: string,
  ) {
    super(message);
    this.name = "RuntimeHonoManifestError";
    if (referenceId !== undefined) this.referenceId = referenceId;
  }
}

/** Require matching manifest, generator, plan and activation versions.
 * @param manifest - Generated runtime manifest.
 * @returns Nothing for a coherent build; otherwise throws a manifest error.
 */
export function assertManifestCohort(manifest: RuntimeManifest): void {
  if (manifest.contractVersion !== MANIFEST_VERSION)
    fail(
      "RELKIT_MANIFEST_VERSION_UNSUPPORTED",
      "runtime manifest",
      manifest.contractVersion,
      MANIFEST_VERSION,
    );
  if (manifest.generatorVersion !== GENERATOR_VERSION)
    fail(
      "RELKIT_MANIFEST_GENERATOR_UNSUPPORTED",
      "runtime manifest generator",
      manifest.generatorVersion,
      GENERATOR_VERSION,
    );
  if (manifest.runtimeIntegrationsPlan?.version !== RUNTIME_INTEGRATION_PLAN_VERSION)
    fail(
      "RELKIT_RUNTIME_INTEGRATION_PLAN_VERSION_UNSUPPORTED",
      "runtime-integration plan",
      manifest.runtimeIntegrationsPlan?.version,
      RUNTIME_INTEGRATION_PLAN_VERSION,
    );
  if (
    manifest.runtimeIntegrationsPlan.fileName !== RUNTIME_INTEGRATION_PLAN_FILE ||
    manifest.runtimeIntegrationsPlan.graphHash !== manifest.graphHash
  )
    throw new RuntimeHonoManifestError(
      "RELKIT_RUNTIME_INTEGRATION_PLAN_REFERENCE_INVALID",
      `Runtime-integration plan reference must name ${JSON.stringify(RUNTIME_INTEGRATION_PLAN_FILE)} and match the manifest graph. Rebuild with \`relkit build\`.`,
    );
  if (
    !isRuntimeActivationFingerprint(manifest.activationFingerprint) ||
    manifest.activationFingerprint.graphHash !== manifest.graphHash
  )
    throw new RuntimeHonoManifestError(
      "RELKIT_RUNTIME_ACTIVATION_FINGERPRINT_INVALID",
      "Runtime activation fingerprint is missing, stale, or invalid. Rebuild with `relkit build`.",
    );
}

/** Raise a manifest version error with rebuild guidance.
 * @param code - Stable public error or mapping issue code.
 * @param label - Human-readable name of the versioned artifact.
 * @param actual - Version reported by the artifact.
 * @param expected - Version required by this runtime.
 * @returns Never; throws the corresponding RuntimeHonoManifestError.
 */
function fail(
  code: RuntimeHonoManifestErrorCode,
  label: string,
  actual: unknown,
  expected: number,
): never {
  throw new RuntimeHonoManifestError(
    code,
    `${label} version ${String(actual)} is unsupported; expected ${expected}. Rebuild with \`relkit build\`.`,
  );
}
