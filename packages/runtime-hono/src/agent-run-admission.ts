import { httpValidation } from "./http-validation.js";
import { Effect } from "effect";
import { httpBoundary, HttpBoundaryError } from "./http-effect.js";
import {
  AGENT_STATE_SCHEMA_VERSION,
  AGENT_STREAM_VERSION,
  REALTIME_RUNTIME_LIMITS,
} from "@relkit/contracts";

import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RpcContext } from "./rpc.js";
import {
  agentContext,
  agentLimits,
  digest,
  requireAgentThreadId,
  type AgentInput,
  validateAgentInput,
  verifiedAgentRequestDigest,
} from "./agent-rpc-support.js";
import { acceptAgentResume } from "./agent-rpc-resume.js";
import { startAgentRun } from "./agent-rpc-worker.js";

import { assertWrite, requiredOperationId } from "./agent-command-validation.js";
/** Authorizes input, persists admission and starts work under the owning generation.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The durable admission receipt after generation-owned execution has been started.
 */
export const acceptAgentRunEffect = Effect.fn("AgentCommands.acceptAgentRun")(function* (
  input: AgentInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  yield* httpBoundary("agent.acceptAgentRun", () => assertWrite(input, context, options));
  const threadId = yield* httpValidation("agent.validate", () =>
    requireAgentThreadId(input.threadId),
  );
  if (input.resume !== undefined && input.resume !== true)
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "agent.acceptAgentRun",
        cause: new TypeError("resume must be true when supplied."),
      }),
    );
  const operationId = yield* httpValidation("agent.validate", () =>
    requiredOperationId(input.operationId),
  );
  const resolved = yield* httpBoundary("agent.acceptAgentRun", () =>
    agentContext(
      { ...input, threadId },
      context,
      options,
      input.resume === true ? "resume" : "run",
    ),
  );
  if (input.resume === true) {
    return yield* httpBoundary("agent.acceptAgentRun", () =>
      acceptAgentResume(input, threadId, operationId, resolved, options),
    );
  }
  const requestDigest = yield* httpValidation("agent.validate", () =>
    verifiedAgentRequestDigest(input),
  );
  const value = yield* httpBoundary("agent.acceptAgentRun", () =>
    validateAgentInput(resolved, input.payload),
  );
  const now = new Date().toISOString();
  yield* httpBoundary("agent.acceptAgentRun", () =>
    resolved.provider.createThread({
      ...resolved.scope,
      operationId,
      threadId,
      semanticDigest: digest({ agentId: input.agentId, threadId }),
      now,
      limits: agentLimits,
    }),
  );
  const accepted = yield* httpBoundary("agent.acceptAgentRun", () =>
    resolved.provider.acceptRun({
      ...resolved.scope,
      operationId,
      semanticDigest: requestDigest,
      threadId,
      owner: {
        generationId: options.agentRuntime!.generationId,
        publicFingerprint: options.agentRuntime!.publicFingerprint,
        protocolVersion: AGENT_STREAM_VERSION,
        schemaVersion: AGENT_STATE_SCHEMA_VERSION,
        providerScope: resolved.scope.profile,
      },
      input: value,
      inputDigest: digest(value),
      acceptedAt: now,
      receiptExpiresAt: new Date(Date.now() + REALTIME_RUNTIME_LIMITS.agentReceiptMs).toISOString(),
      limits: agentLimits,
    }),
  );
  startAgentRun(resolved, accepted, value, options, false);
  return accepted;
});
