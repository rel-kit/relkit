/** Registers portable Drizzle asset, selection and rollback cohorts without changing their assertions or fixture lifetimes. */
import { describe, test } from "bun:test";
import {
  caseUsesTheCentralVersionAndByteIdentical,
  caseReusesIdenticalAssetsAndPreservesUnrelatedPatch,
  caseRejectsAConflictingEntryOrAssetBefore,
  caseRejectsSymlinkedPatchDirectoriesInsteadOfReusing,
} from "./dependency-patches-asset.cases.js";
import {
  casePatchOnlyPlansInstallRetainPublicPackage,
  caseLeavesGenericTestingDependenciesFreeOfA,
  caseAddingEffectMQDeliversItsTransitiveDrizzle,
  caseManifestOnlyPatchRegistrationAlsoInstallsAn,
} from "./dependency-patches-selection.cases.js";
import {
  caseAssetOnlyRepairSnapshotsALockCreated,
  caseRollsBackManifestTextAndBinaryLocks,
  caseNoInstallPatchOnlyPlansDeferChecks,
  caseCancellationDuringPatchOnlyInstallationRestoresThe,
} from "./dependency-patches-rollback.cases.js";

describe("portable dependency patches", () => {
  assetCases();
  selectionCases();
  rollbackCases();
});

/** Registers asset identity and collision cases before an installer can mutate files. */
function assetCases(): void {
  test(
    "uses the central version and byte-identical canonical patch asset",
    caseUsesTheCentralVersionAndByteIdentical,
  );

  test(
    "reuses identical assets and preserves unrelated patch entries and file modes",
    caseReusesIdenticalAssetsAndPreservesUnrelatedPatch,
  );

  test(
    "rejects a conflicting entry or asset before changing the manifest",
    caseRejectsAConflictingEntryOrAssetBefore,
  );

  test(
    "rejects symlinked patch directories instead of reusing external assets",
    caseRejectsSymlinkedPatchDirectoriesInsteadOfReusing,
  );
}

/** Registers selected dependency planning and idempotent patch delivery cases. */
function selectionCases(): void {
  test(
    "patch-only plans install, retain public package results, and can be finished twice",
    casePatchOnlyPlansInstallRetainPublicPackage,
  );

  test(
    "leaves generic testing dependencies free of a Drizzle repair",
    caseLeavesGenericTestingDependenciesFreeOfA,
  );

  test(
    "adding Effect MQ delivers its transitive Drizzle repair and reports only the new provider",
    caseAddingEffectMQDeliversItsTransitiveDrizzle,
  );

  test(
    "manifest-only patch registration also installs an already delivered asset",
    caseManifestOnlyPatchRegistrationAlsoInstallsAn,
  );
}

/** Registers failed and interrupted installers against byte and mode restoration. */
function rollbackCases(): void {
  test(
    "asset-only repair snapshots a lock created during the failed installation",
    caseAssetOnlyRepairSnapshotsALockCreated,
  );

  test(
    "rolls back manifest, text and binary locks, assets, and modes after patch-only failure",
    caseRollsBackManifestTextAndBinaryLocks,
  );

  test(
    "no-install patch-only plans defer checks until Bun applies the repair",
    caseNoInstallPatchOnlyPlansDeferChecks,
  );

  test(
    "cancellation during patch-only installation restores the lock and patch ownership",
    caseCancellationDuringPatchOnlyInstallationRestoresThe,
  );
}
