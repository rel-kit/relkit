import { Clock, Context, Effect, Layer } from "effect";
import { canonicalJson, type PendingOperationMetadata } from "@relkit/contracts";
import { createOperationId } from "@relkit/realtime/operation-id";
import { observeExecution } from "@relkit/contracts/operation";
import { nativeCall } from "../native-stream.js";
import {
  PENDING_PREFIX,
  pendingMemory,
  pendingEntryKey,
  readPendingStorage,
  writePendingStorage,
  removePendingStorage,
  clearPendingStorage,
} from "./pending-store.js";
import {
  MAX_JOB_INTENTS,
  PendingCapacityError,
  PendingRecoveryUnavailableError,
  PendingRequestMismatchError,
} from "./pending-errors.js";
import type { PendingOperationService } from "./pending.types.js";

/** Submission receipts, recovery authority and memory-only transmitted requests. */
export class PendingOperations extends Context.Service<
  PendingOperations,
  PendingOperationService
>()("relkit/client/PendingOperations") {}

/**
 * Acquires pending state once; storage remains a best-effort native persistence edge.
 * @param memory - Browser-owned memory state, or an isolated map supplied by tests.
 * @returns A Layer with synchronous state decisions and Effect-owned hashing/time.
 * @example
 * ```ts
 * import { Effect, ManagedRuntime } from "effect";
 * import { PendingOperations, pendingOperationsLayer } from "./pending.service.js";
 * export async function pendingOwner(): Promise<void> {
 *   const owner = ManagedRuntime.make(pendingOperationsLayer(new Map()));
 *   try { await owner.runPromise(Effect.flatMap(PendingOperations, service => service.digest({ input: 1 }))); }
 *   finally { await owner.dispose(); }
 * }
 * ```
 * @see packages/client/tests/transport/examples.test.ts for the checked live Layer example.
 */
export function pendingOperationsLayer(memory = pendingMemory): Layer.Layer<PendingOperations> {
  return Layer.effect(
    PendingOperations,
    Effect.sync(() => {
      /** Merges memory and weakly validated persistence without transmitting inputs.
       * @param scope - Complete pending registry scope.
       * @returns Metadata indexed by the existing operation identity. */
      const list = Effect.fn("PendingOperations.list")((scope: string) =>
        observeExecution(
          "client",
          "pending.list",
          Effect.sync(() => {
            const result = readPendingStorage(scope);
            for (const [key, value] of memory)
              if (key.startsWith(`${PENDING_PREFIX}${scope}.`))
                result.set(value.metadata.operationId, value.metadata);
            return [...result.values()];
          }),
        ),
      );
      /** Hashes the canonical transmitted value before dispatch can begin.
       * @param value - Borrowed request, retained only by opted-in memory state.
       * @returns Its SHA-256 receipt digest. */
      const digest = Effect.fn("PendingOperations.digest")((value: unknown) =>
        observeExecution(
          "client",
          "pending.digest",
          Effect.gen(function* () {
            const bytes = new TextEncoder().encode(
              canonicalJson(value as Parameters<typeof canonicalJson>[0]),
            );
            // WebCrypto does not accept AbortSignal; interruption ignores its result and
            // owns no persistent resource. No submission can occur until hashing completes.
            const hash = yield* nativeCall(() => crypto.subtle.digest("SHA-256", bytes));
            return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
          }),
        ),
      );
      /** Updates receipt authority while retaining existing memory-only input.
       * @param scope - Complete pending registry scope.
       * @param value - Replacement metadata; persistence receives only this value.
       * @returns Best-effort metadata persistence. */
      const update = Effect.fn("PendingOperations.update")(
        (scope: string, value: PendingOperationMetadata) =>
          observeExecution(
            "client",
            "pending.update",
            Effect.sync(() => {
              const key = pendingEntryKey(scope, value.operationId);
              const previous = memory.get(key);
              memory.set(key, {
                metadata: value,
                ...(previous?.request === undefined ? {} : { request: previous.request }),
              });
              writePendingStorage(key, value);
            }),
          ),
      );
      return PendingOperations.of({
        list,
        digest,
        update,
        remember: Effect.fn("PendingOperations.remember")(
          (scope, kind, resource, value, references, options) =>
            observeExecution(
              "client",
              "pending.remember",
              Effect.gen(function* () {
                const operationId = (options.operationId ??
                  createOperationId()) as PendingOperationMetadata["operationId"];
                const before = yield* list(scope);
                yield* Effect.try({
                  try: () => assertCapacity(before, operationId, kind),
                  catch: (cause) => cause,
                });
                const requestDigest = yield* digest(value);
                const now = yield* Clock.currentTimeMillis;
                // Hashing can yield. Re-check capacity/reuse immediately before the atomic
                // write so simultaneous submissions cannot overfill the unresolved registry.
                return yield* Effect.try({
                  try: () => {
                    const merged = readPendingStorage(scope);
                    for (const [key, entry] of memory)
                      if (key.startsWith(`${PENDING_PREFIX}${scope}.`))
                        merged.set(entry.metadata.operationId, entry.metadata);
                    const current = [...merged.values()];
                    assertCapacity(current, operationId, kind);
                    const existing = current.find((entry) => entry.operationId === operationId);
                    if (
                      kind === "job-trigger" &&
                      existing !== undefined &&
                      existing.requestDigest !== requestDigest
                    )
                      throw new PendingRequestMismatchError();
                    if (
                      kind === "job-trigger" &&
                      existing?.state === "unknown" &&
                      !(
                        existing.recovery?.action === "retry-with-same-key" &&
                        (existing.recovery.expiresAt === undefined ||
                          Date.parse(existing.recovery.expiresAt) > now)
                      )
                    )
                      throw new PendingRecoveryUnavailableError();
                    const metadata: PendingOperationMetadata = {
                      operationId,
                      kind,
                      resourceId: resource,
                      ...references,
                      requestDigest,
                      submittedAt: new Date(now).toISOString(),
                      state: "submitted",
                      ...(options.idempotencyKey === undefined
                        ? {}
                        : { idempotencyKey: options.idempotencyKey }),
                      ...(options.recovery === undefined ? {} : { recovery: options.recovery }),
                    };
                    const key = pendingEntryKey(scope, operationId);
                    memory.set(key, {
                      metadata,
                      ...(options.retainRequest === true ? { request: value } : {}),
                    });
                    writePendingStorage(key, metadata);
                    return metadata;
                  },
                  catch: (cause) => cause,
                });
              }),
            ),
        ),
        forget: Effect.fn("PendingOperations.forget")((scope, id) =>
          observeExecution(
            "client",
            "pending.forget",
            Effect.sync(() => {
              memory.delete(pendingEntryKey(scope, id));
              removePendingStorage(pendingEntryKey(scope, id));
            }),
          ),
        ),
        request: Effect.fn("PendingOperations.request")((scope, id) =>
          observeExecution(
            "client",
            "pending.request",
            Effect.sync(() => memory.get(pendingEntryKey(scope, id))?.request),
          ),
        ),
        clear: Effect.fn("PendingOperations.clear")((scope) =>
          observeExecution(
            "client",
            "pending.clear",
            Effect.sync(() => {
              for (const key of [...memory.keys()])
                if (key.startsWith(`${PENDING_PREFIX}${scope}.`)) memory.delete(key);
              clearPendingStorage(scope);
            }),
          ),
        ),
        matches: Effect.fn("PendingOperations.matches")((scope, id, value) =>
          observeExecution(
            "client",
            "pending.matches",
            Effect.gen(function* () {
              const metadata = (yield* list(scope)).find((entry) => entry.operationId === id);
              return metadata !== undefined && metadata.requestDigest === (yield* digest(value));
            }),
          ),
        ),
      });
    }),
  );
}

/**
 * Checks the unresolved job limit without evicting existing recovery authority.
 * @param entries - Existing persisted and memory metadata.
 * @param operationId - Proposed receipt identity.
 * @param kind - Submission kind; only job intents have this bound.
 * @returns Nothing when reuse or insertion is permitted.
 * @throws PendingCapacityError when a new job would exceed the existing limit.
 */
function assertCapacity(
  entries: readonly PendingOperationMetadata[],
  operationId: string,
  kind: PendingOperationMetadata["kind"],
): void {
  if (
    kind === "job-trigger" &&
    !entries.some((entry) => entry.operationId === operationId) &&
    entries.filter((entry) => entry.kind === "job-trigger").length >= MAX_JOB_INTENTS
  )
    throw new PendingCapacityError();
}
