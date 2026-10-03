import { httpValidation } from "./http-validation.js";
import { Effect } from "effect";
import { httpBoundary, HttpBoundaryError } from "./http-effect.js";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";

import { ORPCError } from "@orpc/server";

import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RpcContext } from "./rpc.js";
import {
  agentContext,
  requireAgentThreadId,
  type AgentInput,
  verifiedAgentRequestDigest,
} from "./agent-rpc-support.js";

import { assertAgentRunWritable } from "./agent-compatibility.js";
import { assertWrite, requiredOperationId, isControlPayload } from "./agent-command-validation.js";
/** Authorizes a declared control against the current run before recording its receipt.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The accepted control receipt for the current writable run.
 */
export const acceptAgentControlEffect = Effect.fn("AgentCommands.acceptAgentControl")(function* (
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  yield* httpBoundary("agent.acceptAgentControl", () => assertWrite(input, context, options));
  const threadId = yield* httpValidation("agent.validate", () =>
    requireAgentThreadId(input.threadId),
  );
  if (!isControlPayload(input.kind, input.payload))
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "agent.acceptAgentControl",
        cause: new TypeError("Control request is invalid."),
      }),
    );
  const operationId = yield* httpValidation("agent.validate", () =>
    requiredOperationId(input.operationId),
  );
  const resolved = yield* httpBoundary("agent.acceptAgentControl", () =>
    agentContext({ ...input, threadId }, context, options, input.kind!),
  );
  const requestDigest = yield* httpValidation("agent.validate", () =>
    verifiedAgentRequestDigest(input),
  );
  if (!Array.isArray(resolved.node.controls) || !resolved.node.controls.includes(input.kind))
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "agent.acceptAgentControl",
        cause: new Error("Agent control is not declared."),
      }),
    );
  const snapshot = yield* httpBoundary("agent.acceptAgentControl", () =>
    resolved.provider.loadThread({
      ...resolved.scope,
      threadId,
      maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
    }),
  );
  const runId =
    snapshot.activeRun?.runId ??
    [...snapshot.currentRuns].sort((left, right) =>
      right.acceptedAt.localeCompare(left.acceptedAt),
    )[0]?.runId;
  if (runId === undefined)
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "agent.acceptAgentControl",
        cause: new Error("Agent has no active run."),
      }),
    );
  yield* httpValidation("agent.validate", () => assertAgentRunWritable(snapshot, runId));
  if (
    snapshot.thread.status === "worker-interrupted" &&
    snapshot.activeRun?.owner.generationId !== options.agentRuntime!.generationId
  ) {
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "agent.acceptAgentControl",
        cause: new ORPCError("GENERATION_UNAVAILABLE", {
          message: "The run's owning generation is unavailable.",
        }),
      }),
    );
  }
  const now = new Date().toISOString();
  return yield* httpBoundary("agent.acceptAgentControl", () =>
    resolved.provider.acceptControl({
      ...resolved.scope,
      operationId,
      semanticDigest: requestDigest,
      threadId,
      runId,
      kind: input.kind as "steer" | "follow-up" | "stop" | "approve",
      publicPayload: input.payload,
      acceptedAt: now,
      receiptExpiresAt: new Date(Date.now() + REALTIME_RUNTIME_LIMITS.agentReceiptMs).toISOString(),
      limits: {
        maxQueuedPerRun: REALTIME_RUNTIME_LIMITS.controlsPerRun,
        maxQueuedPerApplication: REALTIME_RUNTIME_LIMITS.controlsPerApplication,
      },
    }),
  );
});
