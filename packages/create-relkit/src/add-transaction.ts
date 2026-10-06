import { Context, Effect, Layer } from "effect";

import { observeExecution } from "@relkit/contracts/operation";

import {
  ADD_FAILURE_CODES,
  AddScaffoldError,
  type AddResult,
  type ScaffoldPlan,
} from "./add-types.js";

import { GeneratorFileSystem } from "./generator-filesystem.js";

import { GeneratorProcess, generatorProcessLayer } from "./generator-process.js";

import { domainError, errorMessage, publicFailure, scaffoldErrors } from "./generator-errors.js";

import { runGeneratorPromise } from "./generator-runtime.js";

import type { ApplyScaffoldContext, ScaffoldTransactionService } from "./add-transaction.types.js";

import { transferCleanupFailures } from "./generator-cleanup.js";

export type { AddCommandResult, ApplyScaffoldContext } from "./add-transaction.types.js";

/** Owns file mutation, install/check and rollback within one finite transaction scope. */
export class ScaffoldTransaction extends Context.Service<
  ScaffoldTransaction,
  ScaffoldTransactionService
>()("create-relkit/ScaffoldTransaction") {}

/**
 * Transaction Layer captures explicit filesystem and process authority once.
 * @returns A ScaffoldTransaction Layer requiring filesystem and process services.
 */
export const scaffoldTransactionLive = Layer.effect(
  ScaffoldTransaction,
  Effect.gen(function* () {
    const fs = yield* GeneratorFileSystem;
    const process = yield* GeneratorProcess;
    return ScaffoldTransaction.of({
      apply: Effect.fn("ScaffoldTransaction.apply")((plan, context) =>
        observeExecution(
          "generator",
          "transaction.apply",
          transactionEffect(plan, context).pipe(
            scaffoldErrors,
            Effect.provideService(GeneratorFileSystem, fs),
            Effect.provideService(GeneratorProcess, process),
            Effect.mapError((error) => {
              const original = publicFailure(error);
              return original instanceof AddScaffoldError
                ? domainError(original)
                : domainError(
                    transferCleanupFailures(
                      original,
                      new AddScaffoldError(ADD_FAILURE_CODES.validation, errorMessage(original)),
                    ),
                  );
            }),
          ),
          () => ({
            files: plan.operations.length,
            dependencies: Object.keys(plan.dependencies).length,
          }),
        ),
      ),
    });
  }),
);

/**
 * Applies a plan with a caller-supplied transaction service.
 * @param plan - Complete immutable plan.
 * @param context - Existing runner and verification settings.
 * @returns A lazy transaction that awaits rollback and marker cleanup before settling.
 */
export const applyScaffoldPlanEffect = Effect.fn("ScaffoldTransaction.commit")(
  function* (plan: ScaffoldPlan, context: ApplyScaffoldContext = {}) {
    return yield* (yield* ScaffoldTransaction).apply(plan, context);
  },
  (effect) => observeExecution("generator", "ScaffoldTransaction.commit", effect),
);

/**
 * Preserves the Promise transaction API and canonical public error constructors.
 * @param plan - Complete plan.
 * @param context - Existing runner, progress and cancellation settings.
 * @returns The unchanged public result after commit, or after completed rollback.
 */
export async function applyScaffoldPlan(
  plan: ScaffoldPlan,
  context: ApplyScaffoldContext = {},
): Promise<AddResult> {
  if (context.signal?.aborted) throw cancelled();
  let program = applyScaffoldPlanEffect(plan, context).pipe(
    Effect.provide(scaffoldTransactionLive),
  );
  if (context.commandRunner !== undefined)
    program = program.pipe(Effect.provide(generatorProcessLayer(context.commandRunner)));
  try {
    return await runGeneratorPromise(program, context.signal);
  } catch (error) {
    if (context.signal?.aborted)
      throw transferCleanupFailures(context.signal, transferCleanupFailures(error, cancelled()));
    if (error instanceof AddScaffoldError) throw error;
    throw transferCleanupFailures(
      error,
      new AddScaffoldError(ADD_FAILURE_CODES.validation, errorMessage(error)),
    );
  }
}

import { transactionEffect } from "./add-transaction-workflow.js";
import { cancelled } from "./add-transaction-process.js";
