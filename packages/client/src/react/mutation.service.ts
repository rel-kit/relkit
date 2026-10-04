import { ORPCError } from "@orpc/client";
import type { PendingOperationMetadata } from "@relkit/contracts";
import { observeExecution } from "@relkit/contracts/operation";
import { Context, Effect, Layer } from "effect";
import { nativeCall } from "../native-stream.js";
import { PendingOperations } from "./pending.service.js";
import { jobUnknownOutcome } from "./pending-outcome.js";
import type { MutationOperationsService } from "./mutation.service.types.js";

/** Accepted-work dispatch and authoritative pending settlement contract. */
export class MutationOperations extends Context.Service<
  MutationOperations,
  MutationOperationsService
>()("@relkit/client/MutationOperations") {}

/**
 * Acquires accepted-work submission and pending-outcome settlement.
 * @returns A resource-free Layer requiring the owning PendingOperations service.
 * @remarks Application view cleanup cannot abort accepted server work.
 * @see tests/compatibility/pending.test.ts for checked metadata and recovery behavior.
 */
export const MutationOperationsLive = Layer.effect(
  MutationOperations,
  Effect.gen(function* () {
    const pending = yield* PendingOperations;
    /** Settles only receipt metadata after a native submission rejection.
     * @param scope - Complete application and identity isolation scope.
     * @param entry - Previously persisted receipt metadata.
     * @param error - Original rejection used by the existing unknown-outcome policy.
     * @returns A lazy observed metadata update, preserving the caller's original rejection. */
    const settle = Effect.fn("MutationOperations.settle")(
      (scope: string, entry: PendingOperationMetadata, error: unknown) =>
        observeExecution(
          "client",
          "mutation.settle",
          Effect.gen(function* () {
            const unknown = jobUnknownOutcome(error);
            if (unknown !== undefined)
              yield* pending.update(scope, {
                ...entry,
                state: "unknown",
                ...(unknown.idempotencyKey === undefined
                  ? {}
                  : { idempotencyKey: unknown.idempotencyKey }),
                recovery: unknown.recovery,
              });
            else if (error instanceof ORPCError) yield* pending.forget(scope, entry.operationId);
            else yield* pending.update(scope, { ...entry, state: "unknown" });
          }),
        ),
    );
    return MutationOperations.of({
      settle,
      /** Dispatches accepted server work with durable metadata and memory-only input.
       * @param scope - Complete receipt isolation scope.
       * @param kind - Existing submission category.
       * @param resource - Declared job or route identity.
       * @param input - Original input retained only in opted-in memory state.
       * @param references - Existing receipt references.
       * @param options - Public idempotency and pending policy.
       * @param execute - Native submission boundary independent of view cancellation.
       * @returns The original native receipt or original rejection after metadata settlement. */
      submit: Effect.fn("MutationOperations.submit")(
        (scope, kind, resource, input, references, options, execute) =>
          observeExecution(
            "client",
            "mutation.submit",
            Effect.gen(function* () {
              const entry = yield* pending.remember(
                scope,
                kind,
                resource,
                input,
                references,
                options,
              );
              return yield* nativeCall(execute).pipe(
                Effect.tap(() => pending.forget(scope, entry.operationId)),
                Effect.catch((error) =>
                  settle(scope, entry, error).pipe(Effect.andThen(Effect.fail(error))),
                ),
              );
            }),
          ),
      ),
    });
  }),
);
