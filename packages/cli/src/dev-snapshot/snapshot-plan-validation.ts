/**
 * Connects runtime plan structure and identities to the verified graph before
 * execution. Compiler-owned task manifests remain explicitly ineligible until
 * the native task runtime and its fast candidate contract are certified.
 */
import { Effect } from "effect";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { SnapshotIntegrationPlan, SnapshotLocalPlan } from "./snapshot-plans.schemas.js";
import { cohortRejected, decodeSnapshotJson } from "./snapshot-json.js";
import type { DevSnapshot } from "./snapshot.types.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";

/**
 * Requires complete versioned plans and matching graph identity before import.
 * @param files - Acquired bounded file authority.
 * @param root - Fully verified immutable capsule directory.
 * @param receipt - Decoded receipt whose plan bytes passed integrity checking.
 * @returns Completion or typed cohort/ineligibility rejection.
 */
export const verifySnapshotPlans = Effect.fn("DevSnapshot.plans")(function* (
  files: SnapshotFileOperations,
  root: string,
  receipt: DevSnapshot,
) {
  const bytes = yield* files.read(root, receipt.runtimeIntegrationsFile, 8_388_608);
  const plan = yield* decodeSnapshotJson(SnapshotIntegrationPlan, bytes);
  if (plan.graphHash !== receipt.graphHash) return yield* cohortRejected("cohort.integrationGraph");
  const registrations = plan.integrations.map(
    (entry) =>
      `${entry.integrationId}\0${entry.capability}\0${entry.adapterId}\0${entry.protocolVersion}`,
  );
  if (new Set(registrations).size !== registrations.length)
    return yield* cohortRejected("cohort.duplicateRegistration");
  if (receipt.localServicesFile !== undefined) {
    const localBytes = yield* files.read(root, receipt.localServicesFile, 8_388_608);
    const local = yield* decodeSnapshotJson(SnapshotLocalPlan, localBytes);
    if (local.graphHash !== receipt.graphHash) return yield* cohortRejected("cohort.localGraph");
    const bindings = local.services.map((entry) => entry.bindingId);
    if (new Set(bindings).size !== bindings.length)
      return yield* cohortRejected("cohort.duplicateBinding");
  }
  if (receipt.jobsManifestFile !== undefined)
    return yield* new DevSnapshotRejected({
      reason: "ineligible",
      operation: "jobs.nativeRuntime",
    });
});
