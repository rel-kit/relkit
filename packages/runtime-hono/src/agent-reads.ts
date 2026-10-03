import { httpValidation } from "./http-validation.js";
import { Context, Effect, Layer } from "effect";
import { httpBoundary, HttpBoundaryError, observeHttp } from "./http-effect.js";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import { assertExpectedIdentity } from "./rpc-identity.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RpcContext } from "./rpc.js";
import { agentContext, requireAgentThreadId, type AgentInput } from "./agent-rpc-support.js";
import { clientAgentSnapshot } from "./agent-compatibility.js";

/** Lists bounded thread summaries after resolving the current principal and authorization.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Up to 100 authorized thread summaries.
 */
export const listAgentThreadsEffect = Effect.fn("AgentReads.listAgentThreads")(function* (
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  yield* httpBoundary("agent.listAgentThreads", () =>
    assertExpectedIdentity(context, options.clientIdentity!, input.expectedIdentity),
  );
  const resolved = yield* httpBoundary("agent.listAgentThreads", () =>
    agentContext(input, context, options, "list"),
  );
  return yield* httpBoundary("agent.listAgentThreads", () =>
    resolved.provider.listThreads({ ...resolved.scope, limit: 100 }),
  );
});

/** Loads the requested thread and applies browser compatibility projection.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The compatible browser snapshot within the initial snapshot byte limit.
 */
export const loadAgentEffect = Effect.fn("AgentReads.loadAgent")(function* (
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  yield* httpBoundary("agent.loadAgent", () =>
    assertExpectedIdentity(context, options.clientIdentity!),
  );
  const threadId = yield* httpValidation("agent.validate", () =>
    requireAgentThreadId(input.threadId),
  );
  const resolved = yield* httpBoundary("agent.loadAgent", () =>
    agentContext({ ...input, threadId }, context, options, "load"),
  );
  return clientAgentSnapshot(
    yield* httpBoundary("agent.loadAgent", () =>
      resolved.provider.loadThread({
        ...resolved.scope,
        threadId,
        maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
      }),
    ),
  );
});

/** Looks up an operation receipt in its authorized agent and identity scope.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The matching scoped receipt, or the provider's missing or expired result.
 */
export const lookupAgentReceiptEffect = Effect.fn("AgentReads.lookupAgentReceipt")(function* (
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  yield* httpBoundary("agent.lookupAgentReceipt", () =>
    assertExpectedIdentity(context, options.clientIdentity!),
  );
  if (input.operationId === undefined || input.requestDigest === undefined)
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "agent.lookupAgentReceipt",
        cause: new TypeError("Receipt request is invalid."),
      }),
    );
  const { operationId, requestDigest } = input;
  const resolved = yield* httpBoundary("agent.lookupAgentReceipt", () =>
    agentContext(input, context, options, "receipt"),
  );
  if (input.kind === "continuation") {
    const threadId = yield* httpValidation("agent.validate", () =>
      requireAgentThreadId(input.threadId),
    );
    return yield* httpBoundary("agent.lookupAgentReceipt", () =>
      resolved.provider.lookupContinuationReceipt({
        ...resolved.scope,
        operationId,
        threadId,
        semanticDigest: requestDigest,
        now: new Date().toISOString(),
      }),
    );
  }
  if (input.kind === "agent-control") {
    const threadId = yield* httpValidation("agent.validate", () =>
      requireAgentThreadId(input.threadId),
    );
    if (input.runId === undefined)
      return yield* Effect.fail(
        new HttpBoundaryError({
          operation: "agent.lookupAgentReceipt",
          cause: new TypeError("Control receipt request is invalid."),
        }),
      );
    const runId = input.runId;
    return yield* httpBoundary("agent.lookupAgentReceipt", () =>
      resolved.provider.lookupControlReceipt({
        ...resolved.scope,
        operationId,
        threadId,
        runId,
        semanticDigest: requestDigest,
        now: new Date().toISOString(),
      }),
    );
  }
  return yield* httpBoundary("agent.lookupAgentReceipt", () =>
    resolved.provider.lookupRunReceipt({
      ...resolved.scope,
      operationId,
      ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
      semanticDigest: requestDigest,
      now: new Date().toISOString(),
    }),
  );
});

/** Reads a bounded immutable snapshot page using its snapshot identifier and cursor.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The requested immutable snapshot page within the history byte limit.
 */
export const readAgentHistoryEffect = Effect.fn("AgentReads.readAgentHistory")(function* (
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  yield* httpBoundary("agent.readAgentHistory", () =>
    assertExpectedIdentity(context, options.clientIdentity!),
  );
  const threadId = yield* httpValidation("agent.validate", () =>
    requireAgentThreadId(input.threadId),
  );
  if (input.snapshotId === undefined || input.cursor === undefined)
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "agent.readAgentHistory",
        cause: new TypeError("Snapshot and cursor are required."),
      }),
    );
  const { snapshotId, cursor } = input;
  const resolved = yield* httpBoundary("agent.readAgentHistory", () =>
    agentContext({ ...input, threadId }, context, options, "history"),
  );
  return yield* httpBoundary("agent.readAgentHistory", () =>
    resolved.provider.readSnapshotHistory({
      ...resolved.scope,
      threadId,
      snapshotId,
      cursor,
      maxEncodedBytes: REALTIME_RUNTIME_LIMITS.snapshotHistoryPageBytes,
    }),
  );
});

/** Lazy agent domain workflows with typed native failures. */
export class AgentReads extends Context.Service<
  AgentReads,
  {
    readonly listAgentThreads: typeof listAgentThreadsEffect;
    readonly loadAgent: typeof loadAgentEffect;
    readonly lookupAgentReceipt: typeof lookupAgentReceiptEffect;
    readonly readAgentHistory: typeof readAgentHistoryEffect;
  }
>()("@relkit/runtime-hono/AgentReads") {}

/** Live operations; tests can replace the same contract. */
export const AgentReadsLive = Layer.succeed(AgentReads, {
  listAgentThreads: (...args) =>
    observeHttp("agent.listAgentThreads", listAgentThreadsEffect(...args)),
  loadAgent: (...args) => observeHttp("agent.loadAgent", loadAgentEffect(...args)),
  lookupAgentReceipt: (...args) =>
    observeHttp("agent.lookupAgentReceipt", lookupAgentReceiptEffect(...args)),
  readAgentHistory: (...args) =>
    observeHttp("agent.readAgentHistory", readAgentHistoryEffect(...args)),
});
