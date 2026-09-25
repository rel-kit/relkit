import { Cause, Effect, Exit } from "effect";
import {
  BucketCapabilityError,
  BucketDependencyError,
  BucketProviderError,
  BucketProviderFailureError,
} from "./client-errors.js";
import { runAbortableEffect } from "./client-abort.js";
import { BucketRuntime } from "./client-runtime.js";
import { classifyEffect, notifyEffect, supportsEffect } from "./client-utils.js";
import type { BucketInvocation } from "./client-operation.types.js";
import type { BucketOperationContext, BucketOperationOutcome } from "./client.types.js";

/** Executes a bucket operation through its injectable provider and telemetry boundary.
 * @param invocation - Fixed operation, provider work, and result validator.
 * @returns Effect of the result or a tagged dependency, capability, provider, cancellation, or timeout error.
 * @example Effect.provide(runBucketOperation({ operation: "get", input: { key: "a" }, work: (p) => p.get!("a"), validate: (v) => v }), bucketRuntimeLayer(options));
 */
export const runBucketOperation = Effect.fn("bucket.operation")(
  <A>(invocation: BucketInvocation<A>) =>
    Effect.gen(function* () {
      const { options, provider, bridgeOwned } = yield* BucketRuntime;
      const signal =
        invocation.context?.signal ?? options.signal?.() ?? new AbortController().signal;
      const deadlineMs = invocation.context?.deadlineMs ?? options.deadline?.();
      const context: BucketOperationContext = {
        operation: invocation.operation,
        signal,
        ...(deadlineMs === undefined ? {} : { deadlineMs }),
      };
      if (!bridgeOwned && options.declared !== false)
        yield* notifyEffect(options.onObservedEdge, {
          relationship: "uses-bucket",
          from: options.ownerId,
          to: options.bucketId,
        });
      const execute = Effect.gen(function* () {
        if (options.declared === false) return yield* new BucketDependencyError(options.bucketId);
        if (
          invocation.capability !== undefined &&
          !(yield* supportsEffect(provider.capabilities, invocation.capability))
        )
          return yield* new BucketCapabilityError(invocation.capability, invocation.operation);
        const providerWork = Effect.tryPromise({
          try: (effectSignal) =>
            Promise.resolve(
              invocation.work(provider, {
                ...context,
                signal: bridgeOwned ? signal : effectSignal,
              }),
            ),
          catch: (cause) =>
            cause instanceof BucketProviderError
              ? cause
              : new BucketProviderFailureError({ operation: invocation.operation, cause }),
        });
        const value = yield* bridgeOwned
          ? providerWork
          : runAbortableEffect(signal, deadlineMs, providerWork);
        return yield* invocation.validate(value);
      });
      if (bridgeOwned) return yield* execute;
      return yield* Effect.onExit(execute, (exit) =>
        Effect.gen(function* () {
          const outcome: BucketOperationOutcome = Exit.isSuccess(exit)
            ? "success"
            : Cause.hasInterruptsOnly(exit.cause)
              ? "cancelled"
              : Cause.squash(exit.cause) instanceof BucketCapabilityError
                ? "unsupported"
                : yield* classifyEffect(Cause.squash(exit.cause));
          yield* notifyEffect(options.onOperation, {
            capability: "buckets",
            operation: invocation.operation,
            ownerId: options.ownerId,
            bucketId: options.bucketId,
            outcome,
          });
        }),
      );
    }),
);
