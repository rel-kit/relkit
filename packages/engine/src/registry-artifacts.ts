import {
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
  isRuntimeActivationFingerprint,
} from "@relkit/contracts";
import type { RegistryIssue, RuntimeManifestInput } from "./registry.js";

/** Collect safe mismatches among generated graph, manifest and integration artifacts.
 * @returns Safe diagnostics describing generated-artifact mismatches.
 * @param manifest - Generated executable manifest paired with the graph.
 */
export function artifactIssues(manifest: RuntimeManifestInput): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  const reference = manifest.runtimeIntegrationsPlan;
  if (!isRecord(reference) || reference.version !== RUNTIME_INTEGRATION_PLAN_VERSION) {
    issues.push({
      code: "RELKIT_RUNTIME_INTEGRATION_PLAN_REFERENCE_INVALID",
      message: `Runtime-integration plan reference version ${String(isRecord(reference) ? reference.version : undefined)} is unsupported; expected ${RUNTIME_INTEGRATION_PLAN_VERSION}. Rebuild with \`relkit build\`.`,
    });
  } else if (
    reference.fileName !== RUNTIME_INTEGRATION_PLAN_FILE ||
    reference.graphHash !== manifest.graphHash
  ) {
    issues.push({
      code: "RELKIT_RUNTIME_INTEGRATION_PLAN_REFERENCE_INVALID",
      message: `Runtime-integration plan reference must name ${JSON.stringify(RUNTIME_INTEGRATION_PLAN_FILE)} and match the manifest graph. Rebuild with \`relkit build\`.`,
    });
  }
  if (
    !isRuntimeActivationFingerprint(manifest.activationFingerprint) ||
    manifest.activationFingerprint.graphHash !== manifest.graphHash
  ) {
    issues.push({
      code: "RELKIT_RUNTIME_ACTIVATION_FINGERPRINT_INVALID",
      message:
        "Manifest activation fingerprint is missing, stale, or invalid. Rebuild with `relkit build`.",
    });
  }
  return issues;
}

/** Recognize non-null object records before reading native fields.
 * @returns Whether the native value satisfies this guard.
 * @param value - Native value being validated or projected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
