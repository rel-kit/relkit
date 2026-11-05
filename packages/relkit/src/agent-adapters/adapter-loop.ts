/**
 * Shared agent loop behind every first-party adapter. RelKit owns threads, approvals, tool calls,
 * limits, stop, traces and stream frames; the adapter supplies one model turn.
 */
import { approveApproval, denyApproval } from "../agents/approval.js";
import type { ApprovalRecord } from "../agents/approval.types.js";
import { AgentAdapterError } from "./adapter-loop-support.js";
import { begin, resumed } from "./adapter-loop-turns.js";
import type { AgentLoopOptions, AgentLoopState as Loop } from "./adapter-loop.types.js";
import type {
  AgentAdapterContext,
  AgentAdapterExecution,
  AgentAdapterFrame,
  AgentAdapterRuntime,
  AgentResumeRequest,
  AgentRunRequest,
  AgentRunResult,
} from "./adapter.types.js";

export { AgentAdapterError } from "./adapter-loop-support.js";
/**
 * Builds an adapter runtime from one SDK-specific model turn.
 * @param options - Adapter identity and its model turn.
 * @returns The runtime half of the adapter.
 * @example createAgentAdapterRuntime({ adapterId: "echo", turn: async () => ({ text: "hi", toolCalls: [] }) });
 * @experimental
 */
export function createAgentAdapterRuntime<const AdapterId extends string>(
  options: AgentLoopOptions<AdapterId>,
): AgentAdapterRuntime<AdapterId> {
  return Object.freeze({
    adapterId: options.adapterId,
    protocolVersion: 1 as const,
    execution: (context: AgentAdapterContext) => execution(options, context),
  });
}

function execution(
  options: AgentLoopOptions<string>,
  context: AgentAdapterContext,
): AgentAdapterExecution {
  const active = new Map<string, AbortController>();
  const open = (runId: string, signal: AbortSignal | undefined) => {
    const controller = new AbortController();
    active.set(runId, controller);
    const signals = [controller.signal, AbortSignal.timeout(context.agent.limits.timeoutMs)];
    return AbortSignal.any(signal === undefined ? signals : [...signals, signal]);
  };
  const drive = async function* (
    threadId: string,
    runId: string,
    start: (loop: Loop) => AsyncGenerator<AgentAdapterFrame, AgentRunResult>,
    signal: AbortSignal | undefined,
  ): AsyncGenerator<AgentAdapterFrame, AgentRunResult> {
    const span = context.trace?.start("agent.run", {
      agentId: context.agent.id,
      adapterId: options.adapterId,
    });
    try {
      yield { kind: "run-started", threadId, runId };
      const model = await context.models.resolve(context.agent.model);
      const loop: Loop = {
        context,
        threadId,
        runId,
        model,
        messages: [],
        steps: 0,
        toolCalls: 0,
        signal: open(runId, signal),
      };
      const result = yield* start(loop);
      yield { kind: "run-finished", threadId, runId, result };
      span?.end("ok");
      return result;
    } catch (cause) {
      span?.end("error");
      const failure =
        cause instanceof AgentAdapterError
          ? cause
          : new AgentAdapterError("RELKIT_AGENT_RUN_FAILED", "Agent execution failed.");
      yield { kind: "run-error", code: failure.code, message: failure.message };
      throw failure;
    } finally {
      active.delete(runId);
    }
  };
  const stream = (request: AgentRunRequest) => {
    const runId = request.runId ?? crypto.randomUUID();
    return drive(
      request.threadId,
      runId,
      (loop) => begin(options, loop, request.input),
      request.signal,
    );
  };
  return Object.freeze({
    stream: (request: AgentRunRequest) => swallow(stream(request)),
    run: (request: AgentRunRequest) => complete(stream(request)),
    resume: async (request: AgentResumeRequest) => {
      const saved = await context.state.load(request.threadId);
      if (saved?.pending === undefined) {
        throw new AgentAdapterError(
          "RELKIT_AGENT_RESUME_UNAVAILABLE",
          "No run is waiting for approval.",
        );
      }
      const pending = saved.pending;
      return complete(
        drive(
          request.threadId,
          pending.runId,
          (loop) => {
            loop.messages = [...saved.messages];
            loop.steps = pending.steps;
            loop.toolCalls = pending.toolCalls;
            const decisions = new Map<string, ApprovalRecord>(
              pending.approvals.map((approval) => [
                approval.toolCallId,
                request.decisions[approval.toolCallId] === "approved"
                  ? approveApproval(approval)
                  : request.decisions[approval.toolCallId] === "denied"
                    ? denyApproval(approval)
                    : approval,
              ]),
            );
            return resumed(options, loop, pending.calls, decisions);
          },
          request.signal,
        ),
      );
    },
    stop: async (runId: string) => {
      active.get(runId)?.abort();
    },
  });
}

async function complete(frames: AsyncGenerator<AgentAdapterFrame, AgentRunResult>) {
  for (;;) {
    const next = await frames.next();
    if (next.done === true) return next.value;
  }
}

async function* swallow(frames: AsyncGenerator<AgentAdapterFrame, AgentRunResult>) {
  try {
    yield* frames;
  } catch {
    // The run-error frame already reported the failure to the stream reader.
  }
}
