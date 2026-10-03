import { Context, Effect, Layer } from "effect";
import { httpBoundary, HttpBoundaryError, observeHttp, runHttp } from "./http-effect.js";
import type { ResolvedAgent } from "./agent-progress-sink.types.js";
import type { ProgressSink } from "@relkit/invocation";
import { createOperationId } from "@relkit/realtime";
import type { ActiveAgentExecution } from "./agent-active-execution.js";
import { agentLimits, digest, encodedBytes } from "./agent-rpc-support.js";

/** Allocates independent journal state; native effects remain lazy.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param active - Mutable state owned by the accepted run and its continuation chain.
 * @param tool - Declared tool or tool-call identity used for policy and attribution.
 * @returns A lazy Effect allocating independent progress state and its emission operation.
 */
export function makeAgentProgress(
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  tool?: { readonly toolCallId: string; readonly toolId: string },
) {
  return Effect.sync(() => {
    let progressRunId = active.receipt.runId;
    let createdAt = new Date().toISOString();
    return Object.freeze({
      emit: Effect.fn("AgentProgress.emit")(
        function* (value: unknown, signal: AbortSignal) {
          if (signal.aborted)
            return yield* Effect.fail(
              new HttpBoundaryError({ operation: "agent.content.emit", cause: signal.reason }),
            );
          if (progressRunId !== active.receipt.runId) {
            progressRunId = active.receipt.runId;
            createdAt = new Date().toISOString();
          }
          const messageId =
            tool === undefined
              ? `${active.receipt.runId}:progress`
              : `${active.receipt.runId}:tool:${tool.toolCallId}:progress`;
          const message = {
            messageId,
            runId: active.receipt.runId,
            role: "tool" as const,
            parts: [
              {
                partId: `${messageId}:latest`,
                kind: "progress" as const,
                scope: tool === undefined ? ("run" as const) : ("tool" as const),
                ...(tool ?? {}),
                value,
              },
            ],
            createdAt,
          };
          yield* httpBoundary("agent.content.emit", () =>
            resolved.provider.appendJournal({
              ...resolved.scope,
              threadId: active.receipt.threadId,
              runId: active.receipt.runId,
              claim: active.claim,
              operationId: createOperationId(),
              semanticDigest: digest(message),
              record: {
                recordId: crypto.randomUUID(),
                runId: active.receipt.runId,
                kind: "message",
                publicValue: message,
                encodedBytes: encodedBytes(message),
                createdAt: new Date().toISOString(),
              },
              limits: agentLimits,
            }),
          );
        },
        (effect) => observeHttp("agent.content.emit", effect),
      ),
    });
  });
}

/** Owns per-run journal emission and progress state. */
export class AgentProgress extends Context.Service<
  AgentProgress,
  Effect.Success<ReturnType<typeof makeAgentProgress>>
>()("@relkit/runtime-hono/AgentProgress") {}

/** Allocates one stateful journal service per supplied layer.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param active - Mutable state owned by the accepted run and its continuation chain.
 * @param tool - Declared tool or tool-call identity used for policy and attribution.
 * @returns A layer allocating one independent progress service and its emission state.
 */
export function AgentProgressLive(
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  tool?: { readonly toolCallId: string; readonly toolId: string },
) {
  return Layer.effect(AgentProgress, makeAgentProgress(resolved, active, tool));
}

/** Builds the native journal compatibility adapter over one owned service instance.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param active - Mutable state owned by the accepted run and its continuation chain.
 * @param tool - Declared tool or tool-call identity used for policy and attribution.
 * @returns A native progress sink backed by one owned progress service.
 */
export function createAgentProgressSink(
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  tool?: { readonly toolCallId: string; readonly toolId: string },
): ProgressSink {
  const service = Effect.runSync(makeAgentProgress(resolved, active, tool));
  return {
    ...service,
    emit: (value, signal) => runHttp(service.emit(value, signal), signal),
  };
}
