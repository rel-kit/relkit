import type { ProgressSink } from "@relkit/invocation";
import { createOperationId } from "@relkit/realtime";
import type { ActiveAgentExecution } from "./agent-active-execution.js";
import { agentLimits, digest, encodedBytes, type agentContext } from "./agent-rpc-support.js";

type ResolvedAgent = Awaited<ReturnType<typeof agentContext>>;

export function createAgentProgressSink(
  resolved: ResolvedAgent,
  active: ActiveAgentExecution,
  tool?: { readonly toolCallId: string; readonly toolId: string },
): ProgressSink {
  let progressRunId = active.receipt.runId;
  let createdAt = new Date().toISOString();
  return Object.freeze({
    emit: async (value: unknown, signal: AbortSignal) => {
      if (signal.aborted) throw signal.reason;
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
          createdAt: new Date().toISOString(),
        },
        limits: agentLimits,
      });
    },
  });
}
