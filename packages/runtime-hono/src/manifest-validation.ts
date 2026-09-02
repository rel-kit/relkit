import {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
  isRuntimeActivationFingerprint,
} from "@relkit/contracts";
import type { RuntimeManifest } from "./materialize-routes.js";

export type RuntimeHonoManifestErrorCode =
  | "RELKIT_MANIFEST_VERSION_UNSUPPORTED"
  | "RELKIT_MANIFEST_GENERATOR_UNSUPPORTED"
  | "RELKIT_RUNTIME_INTEGRATION_PLAN_VERSION_UNSUPPORTED"
  | "RELKIT_RUNTIME_INTEGRATION_PLAN_REFERENCE_INVALID"
  | "RELKIT_RUNTIME_ACTIVATION_FINGERPRINT_INVALID"
  | "RELKIT_GRAPH_MANIFEST_MISMATCH"
  | "RELKIT_MANIFEST_MIDDLEWARE_MISSING"
  | "RELKIT_MANIFEST_MIDDLEWARE_MISMATCH"
  | "RELKIT_MANIFEST_RAW_ROUTE_MISSING"
  | "RELKIT_MANIFEST_TRANSFORM_MISSING";

export class RuntimeHonoManifestError extends Error {
  readonly referenceId?: string;

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
