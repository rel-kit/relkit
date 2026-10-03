import { Effect } from "effect";
import { httpBoundary, HttpBoundaryError, observeHttp } from "./http-effect.js";
import type { ResolvedAgent } from "./agent-content-sink.types.js";
import type { ToolPartState } from "@relkit/agents";

import type { ActiveAgentExecution } from "./agent-active-execution.js";

import { agentLimits, digest, encodedBytes } from "./agent-rpc-support.js";
import { createOperationId } from "@relkit/realtime";

/** Allocates tool-message replay state for one run, retaining the original part and creation identifiers.
 * @param resolved - Authorized provider and durable scope.
 * @param active - Current execution claim and continuation receipt.
 * @returns A lazy tool-journal operation owning incremental part state.
 */
export function makeAgentToolContent(resolved: ResolvedAgent, active: ActiveAgentExecution) {
  const toolParts = new Map<
    string,
    {
      partId: string;
      kind: "tool";
      toolCallId: string;
      toolId: string;
      state: ToolPartState;
      inputText?: string;
      input?: unknown;
      output?: unknown;
    }
  >();
  const toolCreatedAt = new Map<string, string>();

  return Effect.fn("AgentContent.emitTool")(
    function* (
      value: { toolCallId: string; toolId: string; state: ToolPartState; value?: unknown },
      signal: AbortSignal,
    ) {
      if (signal.aborted)
        return yield* Effect.fail(
          new HttpBoundaryError({ operation: "agent.content.emitTool", cause: signal.reason }),
        );
      const toolMessageId = `${active.receipt.runId}:tool:${value.toolCallId}`;
      const prior = toolParts.get(value.toolCallId);
      const part = {
        ...(prior ?? {
          partId: `${toolMessageId}:state`,
          kind: "tool" as const,
          toolCallId: value.toolCallId,
          toolId: value.toolId,
        }),
        state: value.state,
        ...(value.state === "input-streaming" && typeof value.value === "string"
          ? { inputText: value.value }
          : {}),
        ...(value.state === "input-ready" ? { input: value.value } : {}),
        ...(value.state === "succeeded" ? { output: value.value } : {}),
      };
      toolParts.set(value.toolCallId, part);
      const createdAt = toolCreatedAt.get(value.toolCallId) ?? new Date().toISOString();
      toolCreatedAt.set(value.toolCallId, createdAt);
      const message = {
        messageId: toolMessageId,
        runId: active.receipt.runId,
        role: "tool" as const,
        parts: [part],
        createdAt,
      };
      yield* httpBoundary("agent.content.emitTool", () =>
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
            createdAt: message.createdAt,
          },
          limits: agentLimits,
        }),
      );
    },
    (effect) => observeHttp("agent.content.emitTool", effect),
  );
}
