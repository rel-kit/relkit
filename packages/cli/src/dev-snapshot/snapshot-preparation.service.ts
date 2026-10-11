/**
 * Prepares one portable dev snapshot from one successful safe check. It owns a
 * temporary build and source/dependency epoch, bundles once, rechecks bytes and
 * atomically publishes a complete immutable cohort. No listeners, inspector or
 * persistent telemetry are started by this finite workflow.
 */
import { join } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import { observeExecution } from "@relkit/contracts/operation";
import { Context, Effect, Layer } from "effect";
import { CliFileSystem } from "../services/filesystem.service.js";
import { SnapshotFiles } from "./snapshot-files.service.js";
import { SnapshotCompilation } from "./snapshot-compilation.service.js";
import { SnapshotDependencies } from "./snapshot-dependencies.service.js";
import { SnapshotPublication } from "./snapshot-publication.service.js";
import { SnapshotPublicationNative } from "./snapshot-publication-native.js";
import { SnapshotEpochs } from "./snapshot-epoch.service.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { captureSnapshotInputs } from "./snapshot-fingerprint.js";
import {
  captureSnapshotArtifacts,
  readSnapshotBuildCohort,
  snapshotReceipt,
} from "./snapshot-recipe.js";
import {
  verifyPreparationInputs,
  verifySnapshotProjectEligibility,
} from "./snapshot-preparation-guards.js";
import type {
  SnapshotPreparationAuthorities,
  SnapshotPreparationOperations,
  SnapshotPreparationRequest,
} from "./snapshot-preparation.types.js";
import type { SnapshotCheckedCompilation } from "./snapshot-compilation.types.js";
import { verifySnapshotTypecheckInputs } from "./snapshot-typecheck-inputs.js";
import type { SnapshotMember } from "./snapshot.types.js";

/** Shared preparation authorities are captured during service acquisition, not rebuilt per step. */
export class SnapshotPreparation extends Context.Service<
  SnapshotPreparation,
  SnapshotPreparationOperations
>()("relkit/DevSnapshot/Preparation", {
  make: Effect.gen(function* () {
    const authorities = {
      files: yield* SnapshotFiles,
      compilation: yield* SnapshotCompilation,
      dependencies: yield* SnapshotDependencies,
      publication: yield* SnapshotPublication,
      native: yield* SnapshotPublicationNative,
      epochs: yield* SnapshotEpochs,
      writes: yield* CliFileSystem,
    } satisfies SnapshotPreparationAuthorities;
    return {
      prepare: Effect.fn("SnapshotPreparation.prepare")((request: SnapshotPreparationRequest) =>
        observeExecution("cli", "dev.snapshot.prepare", prepareSnapshot(authorities, request)),
      ),
    } satisfies SnapshotPreparationOperations;
  }),
}) {}

/** Installs preparation policy with explicit live or deterministic test authorities. */
export const snapshotPreparationLive = Layer.effect(SnapshotPreparation, SnapshotPreparation.make);

/**
 * Revalidates one safe check/build under a final scoped installed-input watch.
 * @param authorities - Captured compilation, filesystem and publication services.
 * @param request - Physical project, actual tool versions and generated probe policy.
 * @returns Content-addressed snapshot identity or typed rejection/native failure.
 */
const prepareSnapshot = Effect.fn("DevSnapshot.prepare")(
  (authorities: SnapshotPreparationAuthorities, request: SnapshotPreparationRequest) =>
    Effect.scoped(
      Effect.gen(function* () {
        const stage = yield* authorities.native.stage(request.projectRoot);
        const root = stage.projectRoot;
        const inputs = yield* captureSnapshotInputs(root).pipe(
          Effect.provideService(SnapshotFiles, authorities.files),
        );
        yield* verifySnapshotProjectEligibility(authorities.files, root, inputs);
        const checked = yield* authorities.compilation.check(root, inputs, request.tools);
        if (!checked.ok || !checked.activatable || checked.graphHash === undefined)
          return yield* rejected("preparation.check");
        const directory = join(stage.directory, "build");
        const receipt = yield* prepareRecipe(
          authorities,
          { ...request, projectRoot: root },
          directory,
          checked,
          inputs,
        );
        // Preparation-owned build writes are complete before the watch begins.
        // The following full verification detects any earlier input drift; the
        // epoch then closes the race through publication and pointer switching.
        const epoch = yield* authorities.epochs.begin(root);
        const token = yield* epoch.current;
        const current = verifyPreparationInputs(
          authorities.files,
          root,
          directory,
          inputs,
          receipt.dependencies,
        ).pipe(
          Effect.andThen(
            verifySnapshotTypecheckInputs(authorities.files, root, receipt.typecheckInputs),
          ),
          Effect.andThen(epoch.verify(token)),
        );
        const generation = yield* authorities.publication.publish(
          root,
          directory,
          receipt,
          current,
        );
        return { generation, graphHash: receipt.graphHash };
      }),
    ),
);

/**
 * Materializes the checked cohort and captures its portable executable/input indexes.
 * @param authorities - Captured build, bounded read and write operations.
 * @param request - Physical project and actual tools/probe policy.
 * @param directory - Private build destination owned by the outer Scope.
 * @param checked - Original successful safe check result.
 * @param inputs - Source inventory established before checking.
 * @returns Complete receipt without a second check or pointer publication.
 */
const prepareRecipe = Effect.fn("DevSnapshot.prepareRecipe")(function* (
  authorities: SnapshotPreparationAuthorities,
  request: SnapshotPreparationRequest,
  directory: string,
  checked: SnapshotCheckedCompilation,
  inputs: readonly SnapshotMember[],
) {
  const root = request.projectRoot;
  const built = yield* authorities.compilation.buildChecked(root, directory, checked);
  if (!built.ok || built.activationFingerprint === undefined)
    return yield* rejected("preparation.bundle");
  const metafilePath = `${directory.slice(root.length + 1)}/server/bun.inputs.json`;
  const dependencies = yield* authorities.dependencies.capture(
    root,
    yield* authorities.files.read(root, metafilePath, 8_388_608),
    directory,
    authorities.writes,
  );
  const cohort = yield* readSnapshotBuildCohort(authorities.files, root, directory, request.probe);
  yield* authorities.writes.writeText(
    join(directory, "imports.json"),
    canonicalJson(cohort.routeImports) + "\n",
  );
  const artifacts = yield* captureSnapshotArtifacts(authorities.files, root, directory);
  return snapshotReceipt(
    cohort,
    checked,
    request.tools,
    inputs,
    dependencies,
    artifacts,
    checked.typecheckInputs,
  );
});

/**
 * Rejects unsuccessful checking/building without granting executable authority.
 * @param operation - Fixed preparation failure context.
 * @returns Expected ineligibility, distinct from defects and interruption.
 */
function rejected(operation: string) {
  return new DevSnapshotRejected({ reason: "ineligible", operation });
}
