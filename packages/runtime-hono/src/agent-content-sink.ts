import { makeAgentToolContent } from "./agent-tool-content.js";
import { Context, Effect, Layer } from "effect";
import { httpBoundary, HttpBoundaryError, observeHttp, runHttp } from "./http-effect.js";
import type { ResolvedAgent, AgentJournalSink } from "./agent-content-sink.types.js";
export type { AgentJournalSink } from "./agent-content-sink.types.js";
import type { AgentContentSink, AgentExecutionEvent } from "@relkit/agents";
import type { BrowserMessage } from "@relkit/contracts";
import type { ActiveAgentExecution } from "./agent-active-execution.js";

import { appendAgentMessage, appendBrowserMessage } from "./agent-run-journal.js";
import { agentLimits, digest, encodedBytes } from "./agent-rpc-support.js";
import { createOperationId } from "@relkit/realtime";
import { createAgentProgressSink } from "./agent-progress-sink.js";

/** Allocates independent journal state; native effects remain lazy.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param active - Mutable state owned by the accepted run and its continuation chain.
 * @param messageId - Stable public message identifier retained across streaming updates.
 * @param assistantCreatedAt - Original assistant-message timestamp retained across updates.
 * @returns A lazy Effect allocating independent content state and typed journal operations.
 */
export function makeAgentContent(
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  messageId: string,
  assistantCreatedAt: string,
) {
  return Effect.sync(() => {
    const emitTool = makeAgentToolContent(resolved, active);
    let latestOutput: unknown;
    let hasOutput = false;
    let outputFinished = false;
    let waiting = false;
    return Object.freeze({
      isWaiting: () => waiting,
      emitWaiting: Effect.fn("AgentContent.emitWaiting")(
        function* (
          value: Parameters<NonNullable<AgentContentSink["emitWaiting"]>>[0],
          signal: AbortSignal,
        ) {
          if (waiting) return;
          if (signal.aborted)
            return yield* Effect.fail(
              new HttpBoundaryError({
                operation: "agent.content.emitWaiting",
                cause: signal.reason,
              }),
            );
          yield* httpBoundary("agent.content.emitWaiting", () =>
            resolved.provider.suspendRun({
              ...resolved.scope,
              operationId: createOperationId(),
              threadId: active.receipt.threadId,
              runId: active.receipt.runId,
              claim: active.claim,
              waiting: { ...value, runId: active.receipt.runId },
              suspendedAt: new Date().toISOString(),
            }),
          );
          waiting = true;
        },
        (effect) => observeHttp("agent.content.emitWaiting", effect),
      ),
      ensureOutput: Effect.fn("AgentContent.ensureOutput")(
        function* (value: unknown, signal: AbortSignal) {
          if (outputFinished) return;
          if (signal.aborted)
            return yield* Effect.fail(
              new HttpBoundaryError({
                operation: "agent.content.ensureOutput",
                cause: signal.reason,
              }),
            );
          yield* httpBoundary("agent.content.ensureOutput", () =>
            appendAgentMessage(
              resolved,
              active.receipt,
              active.claim,
              "assistant",
              hasOutput ? latestOutput : value,
              messageId,
              assistantCreatedAt,
              "complete",
            ),
          );
          outputFinished = true;
        },
        (effect) => observeHttp("agent.content.ensureOutput", effect),
      ),
      emitEvent: Effect.fn("AgentContent.emitEvent")(
        function* (value: AgentExecutionEvent, signal: AbortSignal) {
          if (signal.aborted)
            return yield* Effect.fail(
              new HttpBoundaryError({ operation: "agent.content.emitEvent", cause: signal.reason }),
            );
          yield* httpBoundary("agent.content.emitEvent", () =>
            resolved.provider.appendJournal({
              ...resolved.scope,
              threadId: active.receipt.threadId,
              runId: active.receipt.runId,
              claim: active.claim,
              operationId: createOperationId(),
              semanticDigest: digest(value),
              record: {
                recordId: crypto.randomUUID(),
                runId: active.receipt.runId,
                kind: "event",
                publicValue: value,
                encodedBytes: encodedBytes(value),
                createdAt: value.occurredAt,
              },
              limits: agentLimits,
            }),
          );
        },
        (effect) => observeHttp("agent.content.emitEvent", effect),
      ),
      emitMessage: Effect.fn("AgentContent.emitMessage")(
        function* (value: BrowserMessage, signal: AbortSignal) {
          if (signal.aborted)
            return yield* Effect.fail(
              new HttpBoundaryError({
                operation: "agent.content.emitMessage",
                cause: signal.reason,
              }),
            );
          yield* httpBoundary("agent.content.emitMessage", () =>
            appendBrowserMessage(resolved, active.receipt, active.claim, {
              ...value,
              runId: active.receipt.runId,
            }),
          );
        },
        (effect) => observeHttp("agent.content.emitMessage", effect),
      ),
      progressSinkForTool: (tool: { readonly toolCallId: string; readonly toolId: string }) =>
        createAgentProgressSink(resolved, active, tool),
      emitOutput: Effect.fn("AgentContent.emitOutput")(
        function* (value: unknown, signal: AbortSignal) {
          if (signal.aborted)
            return yield* Effect.fail(
              new HttpBoundaryError({
                operation: "agent.content.emitOutput",
                cause: signal.reason,
              }),
            );
          latestOutput = value;
          hasOutput = true;
          return yield* httpBoundary("agent.content.emitOutput", () =>
            appendAgentMessage(
              resolved,
              active.receipt,
              active.claim,
              "assistant",
              value,
              messageId,
              assistantCreatedAt,
              "streaming",
            ),
          );
        },
        (effect) => observeHttp("agent.content.emitOutput", effect),
      ),
      finishOutput: Effect.fn("AgentContent.finishOutput")(
        function* (signal: AbortSignal) {
          if (signal.aborted)
            return yield* Effect.fail(
              new HttpBoundaryError({
                operation: "agent.content.finishOutput",
                cause: signal.reason,
              }),
            );
          if (!hasOutput || outputFinished) return;
          yield* httpBoundary("agent.content.finishOutput", () =>
            appendAgentMessage(
              resolved,
              active.receipt,
              active.claim,
              "assistant",
              latestOutput,
              messageId,
              assistantCreatedAt,
              "complete",
            ),
          );
          outputFinished = true;
        },
        (effect) => observeHttp("agent.content.finishOutput", effect),
      ),
      emitTool,
    });
  });
}

/** Owns per-run journal emission and progress state. */
export class AgentContent extends Context.Service<
  AgentContent,
  Effect.Success<ReturnType<typeof makeAgentContent>>
>()("@relkit/runtime-hono/AgentContent") {}

/** Allocates one stateful journal service per supplied layer.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param active - Mutable state owned by the accepted run and its continuation chain.
 * @param messageId - Stable public message identifier retained across streaming updates.
 * @param assistantCreatedAt - Original assistant-message timestamp retained across updates.
 * @returns A layer allocating one independent content service and its per-run replay state.
 */
export function AgentContentLive(
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  messageId: string,
  assistantCreatedAt: string,
) {
  return Layer.effect(
    AgentContent,
    makeAgentContent(resolved, active, messageId, assistantCreatedAt),
  );
}

/** Builds the native journal compatibility adapter over one owned service instance.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param active - Mutable state owned by the accepted run and its continuation chain.
 * @param messageId - Stable public message identifier retained across streaming updates.
 * @param assistantCreatedAt - Original assistant-message timestamp retained across updates.
 * @returns Promise methods sharing one content service, with a synchronous waiting-state query.
 */
export function createAgentContentSink(
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  messageId: string,
  assistantCreatedAt: string,
): AgentJournalSink {
  const service = Effect.runSync(makeAgentContent(resolved, active, messageId, assistantCreatedAt));
  return {
    ...service,
    emitWaiting: (value, signal) => runHttp(service.emitWaiting(value, signal), signal),
    ensureOutput: (value, signal) => runHttp(service.ensureOutput(value, signal), signal),
    emitEvent: (value, signal) => runHttp(service.emitEvent(value, signal), signal),
    emitMessage: (value, signal) => runHttp(service.emitMessage(value, signal), signal),
    emitOutput: (value, signal) => runHttp(service.emitOutput(value, signal), signal),
    finishOutput: (signal) => runHttp(service.finishOutput(signal), signal),
    emitTool: (value, signal) => runHttp(service.emitTool(value, signal), signal),
  };
}
