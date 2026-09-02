import {
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
  isRuntimeActivationFingerprint,
} from "@relkit/contracts";
import type { RegistryIssue, RuntimeManifestInput } from "./registry.js";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
