import { Cause, Context, Deferred, Effect, Exit, Layer, Ref, Scope } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { identity, type InspectorMode, type ResolvedActiveGeneration } from "./shared.js";
import { InspectorActionError } from "./actions-errors.js";
import { dispatchInspectorActionEffect } from "./actions-dispatch.js";
import {
  makeAudit,
  requestFingerprint,
  toActionError,
  validateIdentity,
  writeAuditEffect,
} from "./actions-utils.js";
import { nativeAttempt, projectionAttempt, unwrapInspectorFailure } from "./native-edge.js";
import type { InspectorControlFailure } from "./native-edge.types.js";
import type { InspectorActionRequest } from "./actions.js";
import type {
  InspectorActionEntry,
  InspectorActionExecutionOptions,
  InspectorControlService,
} from "./actions-runtime.types.js";

/** Owns authoritative Inspector action receipts and concurrent dispatches. */
export class InspectorControls extends Context.Service<
  InspectorControls,
  InspectorControlService
>()("@relkit/inspector/Controls") {}

/**
 * Acquires a control owner with an unbounded authoritative receipt store.
 * @returns A scoped layer whose dispatch fibers stop when its owner is disposed.
 * @remarks Receipts cannot use TTL, capacity eviction or retries: dispatches can
 * cause irreversible side effects. A disconnected waiter never deletes a receipt.
 * @example
 * ```ts
 * import { ManagedRuntime } from "effect";
 * import { inspectorControlsLayer } from "@relkit/inspector-api";
 * const owner = ManagedRuntime.make(inspectorControlsLayer);
 * try { await owner.context(); } finally { await owner.dispose(); }
 * ```
 */
export const inspectorControlsLayer = Layer.effect(
  InspectorControls,
  Effect.gen(function* () {
    const scope = yield* Scope.Scope;
    const entries = yield* Ref.make(new Map<string, InspectorActionEntry>());
    const externalEntries = new WeakMap<
      Map<string, Promise<import("./actions-runtime.types.js").InspectorActionResult>>,
      Ref.Ref<Map<string, InspectorActionEntry>>
    >();
    const execute = Effect.fn("InspectorControls.execute")(
      function* (request: InspectorActionRequest, options: InspectorActionExecutionOptions) {
        const generation = yield* options.generationEffect ?? nativeAttempt(options.getGeneration);
        if (generation === undefined)
          return yield* Effect.fail(
            new InspectorActionError("RELKIT_INSPECTOR_ACTION_GENERATION_UNAVAILABLE", 503),
          );
        yield* projectionAttempt(() => validateIdentity(request, generation, options.mode)).pipe(
          Effect.catch((error) => rejectAction(error, request, generation, options.mode)),
        );
        const key = `${generation.generationId}:${request.action}:${request.targetId}:${request.idempotencyKey}`;
        const fingerprint = yield* projectionAttempt(() =>
          requestFingerprint(request, generation),
        ).pipe(Effect.catch((error) => rejectAction(error, request, generation, options.mode)));
        let store = entries;
        if (options.idempotency !== undefined) {
          const supplied = externalEntries.get(options.idempotency);
          if (supplied !== undefined) store = supplied;
          else {
            store = yield* Ref.make(new Map<string, InspectorActionEntry>());
            externalEntries.set(options.idempotency, store);
          }
        }
        return yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const existingReceipt = options.idempotency?.get(key);
            if (existingReceipt !== undefined) {
              const receipt = yield* restore(nativeAttempt(() => existingReceipt));
              if (receipt.fingerprint !== fingerprint)
                return yield* rejectAction(
                  new InspectorActionError("RELKIT_INSPECTOR_IDEMPOTENCY_CONFLICT", 409),
                  request,
                  generation,
                  options.mode,
                );
              return receipt;
            }
            const result = yield* Deferred.make<
              import("./actions-runtime.types.js").InspectorActionResult,
              InspectorControlFailure
            >();
            const entry = { fingerprint, result };
            const selected = yield* Ref.modify(store, (current) => {
              const existing = current.get(key);
              if (existing !== undefined) return [existing, current] as const;
              return [entry, new Map(current).set(key, entry)] as const;
            });
            if (selected === entry) {
              let publish:
                | ((
                    exit: Exit.Exit<
                      import("./actions-runtime.types.js").InspectorActionResult,
                      InspectorControlFailure
                    >,
                  ) => void)
                | undefined;
              if (options.idempotency !== undefined) {
                // The supplied Promise map remains the authoritative compatibility store.
                const receipt = new Promise<
                  import("./actions-runtime.types.js").InspectorActionResult
                >((resolve, reject) => {
                  publish = (exit) =>
                    Exit.isSuccess(exit)
                      ? resolve(exit.value)
                      : reject(unwrapInspectorFailure(Cause.squash(exit.cause)));
                });
                void receipt.catch(() => undefined);
                options.idempotency.set(key, receipt);
              }
              // The owner, not the first HTTP waiter, owns dispatch completion.
              yield* perform(request, generation, options.mode, fingerprint).pipe(
                Effect.catch((error) => rejectAction(error, request, generation, options.mode)),
                Effect.onExit((exit) =>
                  Deferred.done(result, exit).pipe(
                    Effect.andThen(Effect.sync(() => publish?.(exit))),
                  ),
                ),
                Effect.exit,
                Effect.forkIn(scope, { uninterruptible: false }),
              );
            }
            const receipt = yield* restore(Deferred.await(selected.result));
            // Failed dispatches remain authoritative even if a later caller changes inputs.
            if (selected.fingerprint !== fingerprint)
              return yield* rejectAction(
                new InspectorActionError("RELKIT_INSPECTOR_IDEMPOTENCY_CONFLICT", 409),
                request,
                generation,
                options.mode,
              );
            return receipt;
          }),
        );
      },
      (effect) => observeExecution("inspector", "control.execute", effect, () => ({ requests: 1 })),
    );
    return InspectorControls.of({ execute });
  }),
);

/**
 * Records a rejected action and preserves its existing public error envelope.
 * @param error - Native or validation failure.
 * @param request - Identity-validated action request.
 * @param generation - Authoritative active generation.
 * @param mode - Configured Inspector environment.
 * @returns A failing effect after best-effort audit delivery.
 */
const rejectAction = Effect.fn("InspectorControls.reject")(function* (
  error: unknown,
  request: InspectorActionRequest,
  generation: ResolvedActiveGeneration,
  mode: InspectorMode,
) {
  const failure = toActionError(error);
  const record = makeAudit(generation, request, mode, "rejected", failure.code);
  yield* writeAuditEffect(generation, record);
  return yield* Effect.fail(
    new InspectorActionError(failure.code, failure.status, {
      ...identity(generation),
      action: record,
      error: failure.code,
    }),
  );
});

/**
 * Dispatches exactly one action and records its successful receipt.
 * @param request - Authoritative action identity and projected inputs.
 * @param generation - Active generation supplying native action authorities.
 * @param mode - Configured environment for the audit envelope.
 * @param fingerprint - Identity of the validated action inputs.
 * @returns The public successful receipt or an unchanged native failure.
 */
const perform = Effect.fn("InspectorControls.dispatch")(
  function* (
    request: InspectorActionRequest,
    generation: ResolvedActiveGeneration,
    mode: InspectorMode,
    fingerprint: string,
  ) {
    const actions = generation.actions;
    if (actions === undefined)
      return yield* Effect.fail(
        new InspectorActionError("RELKIT_INSPECTOR_ACTIONS_UNAVAILABLE", 503),
      );
    const result = yield* dispatchInspectorActionEffect(request, generation, actions);
    const record = makeAudit(generation, request, mode, "applied");
    yield* writeAuditEffect(generation, record);
    return {
      status: 200,
      fingerprint,
      body: { ...identity(generation), action: record, ...result },
    };
  },
  (effect) => observeExecution("inspector", "control.dispatch", effect, () => ({ dispatches: 1 })),
);
