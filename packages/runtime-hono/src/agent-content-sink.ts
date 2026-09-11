import type { AgentContentSink, AgentExecutionEvent, ToolPartState } from "@relkit/agents";
import type { BrowserMessage } from "@relkit/contracts";
import type { ActiveAgentExecution } from "./agent-active-execution.js";
import type { agentContext } from "./agent-rpc-support.js";
import { appendAgentMessage, appendBrowserMessage } from "./agent-run-journal.js";
import { agentLimits, digest, encodedBytes } from "./agent-rpc-support.js";
import { createOperationId } from "@relkit/realtime";
import { createAgentProgressSink } from "./agent-progress-sink.js";

type ResolvedAgent = Awaited<ReturnType<typeof agentContext>>;

export interface AgentJournalSink extends AgentContentSink {
  readonly ensureOutput: (value: unknown, signal: AbortSignal) => Promise<void>;
  readonly isWaiting: () => boolean;
}

export function createAgentContentSink(
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  messageId: string,
  assistantCreatedAt: string,
): AgentJournalSink {
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
  let latestOutput: unknown;
  let hasOutput = false;
  let outputFinished = false;
  let waiting = false;
  return Object.freeze({
    isWaiting: () => waiting,
    emitWaiting: async (
      value: Parameters<NonNullable<AgentContentSink["emitWaiting"]>>[0],
      signal: AbortSignal,
    ) => {
      if (waiting) return;
      if (signal.aborted) throw signal.reason;
      await resolved.provider.suspendRun({
        ...resolved.scope,
        operationId: createOperationId(),
        threadId: active.receipt.threadId,
        runId: active.receipt.runId,
        claim: active.claim,
        waiting: { ...value, runId: active.receipt.runId },
        suspendedAt: new Date().toISOString(),
      });
      waiting = true;
    },
    ensureOutput: async (value: unknown, signal: AbortSignal) => {
      if (outputFinished) return;
      if (signal.aborted) throw signal.reason;
      await appendAgentMessage(
        resolved,
        active.receipt,
        active.claim,
        "assistant",
        hasOutput ? latestOutput : value,
        messageId,
        assistantCreatedAt,
        "complete",
      );
      outputFinished = true;
    },
    emitEvent: async (value: AgentExecutionEvent, signal: AbortSignal) => {
      if (signal.aborted) throw signal.reason;
      await resolved.provider.appendJournal({
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
      });
    },
    emitMessage: async (value: BrowserMessage, signal: AbortSignal) => {
      if (signal.aborted) throw signal.reason;
      await appendBrowserMessage(resolved, active.receipt, active.claim, {
        ...value,
        runId: active.receipt.runId,
      });
    },
    progressSinkForTool: (tool: { readonly toolCallId: string; readonly toolId: string }) =>
      createAgentProgressSink(resolved, active, tool),
    emitOutput: (value: unknown, signal: AbortSignal) => {
      if (signal.aborted) throw signal.reason;
      latestOutput = value;
      hasOutput = true;
      return appendAgentMessage(
        resolved,
        active.receipt,
        active.claim,
        "assistant",
        value,
        messageId,
        assistantCreatedAt,
        "streaming",
      );
    },
    finishOutput: async (signal: AbortSignal) => {
      if (signal.aborted) throw signal.reason;
      if (!hasOutput || outputFinished) return;
      await appendAgentMessage(
        resolved,
        active.receipt,
        active.claim,
        "assistant",
        latestOutput,
        messageId,
        assistantCreatedAt,
        "complete",
      );
      outputFinished = true;
    },
    emitTool: async (
      value: { toolCallId: string; toolId: string; state: ToolPartState; value?: unknown },
      signal: AbortSignal,
    ) => {
      if (signal.aborted) throw signal.reason;
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
      await resolved.provider.appendJournal({
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
      });
    },
  });
}
