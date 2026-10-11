/**
 * Runs development checking with one isolated TypeScript input journal. The CLI
 * check boundary may publish the resulting portable receipt as a cache; snapshot
 * preparation requires the same evidence when no current cache can be reused.
 */
import { resolve } from "node:path";
import { TypecheckInputs } from "@relkit/compiler";
import { Effect } from "effect";
import { checkProjectEffect } from "../commands/check.js";
import type { CheckOptions } from "../commands/check.types.js";
import { cliAdapterError } from "../cli-errors.js";
import { mapErrorCause } from "../services/map-error-cause.js";
import { SnapshotFiles } from "./snapshot-files.service.js";
import { captureSnapshotInputs, sameSnapshotMembers } from "./snapshot-fingerprint.js";
import { captureSnapshotTypecheckInputs } from "./snapshot-typecheck-inputs.js";
import { writeSnapshotCheckReceipt } from "./snapshot-check-receipt.js";
import { readSnapshotTools } from "./snapshot-tools.js";
import type { SnapshotCheckedCompilation } from "./snapshot-compilation.types.js";

/**
 * Executes one full check and converts its TypeScript journal into portable evidence.
 * @param options - Development compiler options rooted at the project being prepared.
 * @returns The original check result plus normalized current-input witnesses.
 */
export const checkSnapshotProjectEffect = Effect.fn("DevSnapshot.checkProject")(function* (
  options: CheckOptions,
) {
  const root = resolve(options.projectRoot ?? process.cwd());
  const files = yield* SnapshotFiles;
  const journal = yield* TypecheckInputs.make(root).pipe(
    mapErrorCause((error) => cliAdapterError("compiler.inputJournal", error)),
  );
  const checked = yield* checkProjectEffect({ ...options, projectRoot: root }).pipe(
    Effect.provideService(TypecheckInputs, journal),
  );
  const witnesses = yield* journal.evidence.pipe(
    mapErrorCause((error) => cliAdapterError("compiler.inputEvidence", error)),
  );
  const typecheckInputs = yield* captureSnapshotTypecheckInputs(files, root, witnesses).pipe(
    mapErrorCause((error) => cliAdapterError("compiler.inputReceipt", error)),
  );
  return { ...checked, typecheckInputs } satisfies SnapshotCheckedCompilation;
});

/**
 * Preserves ordinary check behavior while publishing reusable evidence when inputs stay stable.
 * @param options - Explicit CLI check options; non-default compiler policies are never cached.
 * @returns The original check result whether optional receipt capture succeeds or not.
 */
export const checkProjectWithCurrentReceiptEffect = Effect.fn("Project.checkWithReceipt")(
  function* (options: CheckOptions = {}) {
    if (!supportsCurrentReceipt(options)) return yield* checkProjectEffect(options);
    const root = resolve(options.projectRoot ?? process.cwd());
    const before = yield* optional(captureSnapshotInputs(root));
    if (before === undefined) return yield* checkProjectEffect(options);
    const journal = yield* optional(TypecheckInputs.make(root));
    if (journal === undefined) return yield* checkProjectEffect(options);
    const checked = yield* checkProjectEffect({ ...options, projectRoot: root }).pipe(
      Effect.provideService(TypecheckInputs, journal),
    );
    if (!checked.ok || !checked.activatable || checked.graphHash === undefined) return checked;
    const witnesses = yield* optional(journal.evidence);
    if (witnesses === undefined) return checked;
    const files = yield* SnapshotFiles;
    const typecheckInputs = yield* optional(captureSnapshotTypecheckInputs(files, root, witnesses));
    if (typecheckInputs === undefined) return checked;
    const after = yield* optional(captureSnapshotInputs(root));
    if (after === undefined || !sameSnapshotMembers(before, after)) return checked;
    const tools = yield* optional(readSnapshotTools(root));
    if (tools === undefined) return checked;
    yield* writeSnapshotCheckReceipt(root, { ...checked, typecheckInputs }, after, tools).pipe(
      Effect.catch(() => Effect.void),
    );
    return checked;
  },
);

/**
 * Limits cross-process reuse to the exact default development-check contract.
 * @param options - Check settings whose external inputs must all be persistable.
 * @returns Whether the ordinary installed-project receipt may represent this check.
 */
function supportsCurrentReceipt(options: CheckOptions): boolean {
  return (
    (options.mode === undefined || options.mode === "development") &&
    options.configPath === undefined &&
    options.config === undefined &&
    options.environmentAllowlist === undefined &&
    options.networkAllowlist === undefined
  );
}

/**
 * Converts expected optional-cache failures to absence while retaining defects/interruption.
 * @typeParam A - Successful optional optimization value.
 * @typeParam E - Expected failure converted to absence.
 * @typeParam R - Services retained by the wrapped effect.
 * @param effect - Optional optimization whose typed failure permits the safe full path.
 * @returns The original success or undefined without handling defects/interruption.
 */
function optional<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A | undefined, never, R> {
  return effect.pipe(
    Effect.map((value) => value as A | undefined),
    Effect.catch(() => Effect.succeed(undefined)),
  );
}
