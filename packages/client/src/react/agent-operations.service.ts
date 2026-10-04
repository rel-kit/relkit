import { ORPCError } from "@orpc/client";
import type { ThreadSnapshot } from "@relkit/contracts";
import { observeExecution } from "@relkit/contracts/operation";
import { Context, Effect, Layer } from "effect";
import { nativeCall } from "../native-stream.js";
import { observeAgent } from "./agent-observation-effect.js";
import { PendingOperations } from "./pending.service.js";
import { procedureCall } from "./procedure.js";
import type {
  AgentOperationsService,
  AgentReceiptLookup,
  AgentSubmission,
  PreparedContinuation,
} from "./agent-operations.types.js";

/** Agent observation, continuation and accepted-work ownership contract. */
export class AgentOperations extends Context.Service<AgentOperations, AgentOperationsService>()(
  "@relkit/client/AgentOperations",
) {}

/**
 * Provides agent operations using the existing pending receipt authority.
 * @returns One resource-free service; each observation owns its stream scope.
 * @example
 * ```ts
 * import { Layer } from "effect";
 * import { AgentOperationsLive } from "./agent-operations.service.js";
 * import { pendingOperationsLayer } from "./pending.service.js";
 * export const live = AgentOperationsLive.pipe(Layer.provide(pendingOperationsLayer()));
 * ```
 */
export const AgentOperationsLive = Layer.effect(
  AgentOperations,
  Effect.gen(function* () {
    const pending = yield* PendingOperations;
    /** Binds a continuation to an authoritative waiting revision.
     * @param client - Borrowed finite procedure client.
     * @param agentId - Declared agent identity.
     * @param threadId - Caller-owned thread identity.
     * @param payload - Transmitted continuation input.
     * @param current - Existing matching snapshot, when already authoritative.
     * @returns The waiting revision and revision-bound digest input. */
    const continuation = Effect.fn("AgentOperations.continuation")(
      (
        client: unknown,
        agentId: string,
        threadId: string,
        payload: unknown,
        current?: ThreadSnapshot,
      ): Effect.Effect<PreparedContinuation, unknown> =>
        observeExecution(
          "client",
          "agent.continuation",
          Effect.gen(function* () {
            const snapshot =
              current?.thread.threadId === threadId && current.waiting !== undefined
                ? current
                : ((yield* nativeCall(async (signal) =>
                    procedureCall(client, "relkit.agent.load")({ agentId, threadId }, { signal }),
                  )) as ThreadSnapshot);
            if (snapshot.waiting === undefined)
              return yield* Effect.fail(new Error("Graph has no waiting continuation."));
            const waitingRevision = snapshot.waiting.revision;
            return { waitingRevision, digestValue: { payload, waitingRevision } };
          }),
        ),
    );
    /** Resolves durable receipts without retrying accepted server work.
     * @param client - Borrowed receipt procedure client.
     * @param scopeKey - Complete receipt isolation scope.
     * @param agentId - Declared agent identity.
     * @param signal - Borrowed view cancellation signal.
     * @returns The first restored durable thread identity, when present. */
    const reconcile = Effect.fn("AgentOperations.reconcile")(
      (
        client: unknown,
        scopeKey: string,
        agentId: string,
        signal: AbortSignal,
      ): Effect.Effect<string | undefined, unknown> =>
        observeExecution(
          "client",
          "agent.reconcile",
          Effect.gen(function* () {
            const candidates = (yield* pending.list(scopeKey)).filter(
              (item) =>
                item.resourceId === agentId &&
                (item.kind === "agent-run" ||
                  item.kind === "agent-control" ||
                  item.kind === "continuation"),
            );
            let restoredThreadId: string | undefined;
            for (const candidate of candidates) {
              if (signal.aborted) break;
              const result = (yield* nativeCall(async (owned) =>
                procedureCall(client, "relkit.agent.receipt")(
                  {
                    agentId,
                    threadId: candidate.threadId,
                    runId: candidate.runId,
                    operationId: candidate.operationId,
                    kind: candidate.kind,
                    requestDigest: candidate.requestDigest,
                  },
                  { signal: AbortSignal.any([signal, owned]) },
                ),
              )) as AgentReceiptLookup;
              if (result.status === "found") {
                yield* pending.forget(scopeKey, candidate.operationId);
                restoredThreadId ??= result.receipt.threadId;
              } else if (result.status === "expired")
                yield* pending.forget(scopeKey, candidate.operationId);
            }
            return restoredThreadId;
          }),
        ),
    );
    /** Records intent before independently owned accepted-work dispatch.
     * @param request - Existing identity, continuation and input authority.
     * @returns The original receipt or original native rejection. */
    const submit = Effect.fn("AgentOperations.submit")(
      (request: AgentSubmission): Effect.Effect<unknown, unknown> =>
        observeExecution(
          "client",
          "agent.submit",
          Effect.gen(function* () {
            const prepared =
              request.resume === true
                ? yield* continuation(
                    request.client,
                    request.agentId,
                    request.threadId,
                    request.payload,
                    request.snapshot,
                  )
                : undefined;
            const entry = yield* pending.remember(
              request.scopeKey,
              prepared === undefined
                ? request.kind === "run"
                  ? "agent-run"
                  : "agent-control"
                : "continuation",
              request.agentId,
              prepared?.digestValue ?? request.payload,
              {
                threadId: request.threadId,
                ...(request.activeRunId === undefined ? {} : { runId: request.activeRunId }),
              },
              {},
            );
            return yield* Effect.gen(function* () {
              // Accepted server work belongs to this submission, independent of view cleanup.
              const receipt = yield* nativeCall(async () =>
                procedureCall(
                  request.client,
                  request.kind === "run" ? "relkit.agent.run" : "relkit.agent.control",
                )({
                  agentId: request.agentId,
                  expectedIdentity: request.identity,
                  threadId: request.threadId,
                  kind: request.kind,
                  payload: request.payload,
                  ...(request.resume === true ? { resume: true } : {}),
                  ...(prepared === undefined ? {} : { waitingRevision: prepared.waitingRevision }),
                  operationId: entry.operationId,
                  requestDigest: entry.requestDigest,
                }),
              );
              yield* pending.update(request.scopeKey, { ...entry, state: "accepted" });
              if (
                request.kind === "run" &&
                isAcceptedAgentRun(receipt) &&
                receipt.threadId !== request.threadId
              )
                return yield* Effect.fail(
                  new Error("Relkit returned a different thread ID than the caller supplied."),
                );
              if (receipt !== undefined) yield* pending.forget(request.scopeKey, entry.operationId);
              return receipt;
            }).pipe(
              Effect.catch((error) =>
                Effect.gen(function* () {
                  if (error instanceof ORPCError)
                    yield* pending.forget(request.scopeKey, entry.operationId);
                  else yield* pending.update(request.scopeKey, { ...entry, state: "unknown" });
                  return yield* Effect.fail(error);
                }),
              ),
            );
          }),
        ),
    );
    return AgentOperations.of({ observe: observeAgent, continuation, reconcile, submit });
  }),
);

/**
 * Retains the existing weak receipt predicate used by agent dispatch.
 * @param value - Native receipt payload.
 * @returns Whether it carries a thread identity.
 */
export function isAcceptedAgentRun(value: unknown): value is { readonly threadId: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { threadId?: unknown }).threadId === "string"
  );
}
