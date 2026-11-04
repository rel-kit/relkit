/** Turn and tool-call steps of the shared agent loop: model turns, bridged tool calls, approval
 * interruption, output checks and thread saves. */
import type { ApprovalRecord } from "../agents/approval.types.js";
import {
  AgentAdapterError,
  OUTPUT_TOOL_NAME,
  inputText,
  instructionText,
  outputTool,
  textCandidates,
  validOutput,
} from "./adapter-loop-support.js";
import type { AgentLoopOptions, AgentLoopState as Loop } from "./adapter-loop.types.js";
import type {
  AgentAdapterFrame,
  AgentRunResult,
  AgentThreadState,
  AgentToolCall,
} from "./adapter.types.js";

/** Starts a run: loads the thread and appends the user input. */
export async function* begin(options: AgentLoopOptions<string>, loop: Loop, input: unknown) {
  const saved = await loop.context.state.load(loop.threadId);
  if (saved?.pending !== undefined) {
    throw new AgentAdapterError("RELKIT_AGENT_RUN_PENDING", "The thread is waiting for approval.");
  }
  loop.messages =
    saved === undefined
      ? [{ role: "system", content: instructionText(loop.context.agent.instructions) }]
      : [...saved.messages];
  loop.messages.push({ role: "user", content: inputText(input) });
  return yield* turns(options, loop);
}

async function* turns(
  options: AgentLoopOptions<string>,
  loop: Loop,
): AsyncGenerator<AgentAdapterFrame, AgentRunResult> {
  const { agent, tools } = loop.context;
  const definitions = [...tools.definitions, outputTool(agent.output)];
  for (;;) {
    if (loop.signal.aborted) return await stopped(loop);
    if (loop.steps >= agent.limits.maxSteps) {
      throw new AgentAdapterError("RELKIT_AGENT_STEP_LIMIT", "The agent reached its step limit.");
    }
    loop.steps += 1;
    const span = loop.context.trace?.start("agent.model", { modelId: loop.model.id });
    const turn = await options
      .turn({ model: loop.model, messages: loop.messages, tools: definitions, signal: loop.signal })
      .catch((cause: unknown) => {
        span?.end("error");
        if (loop.signal.aborted) return undefined;
        throw cause;
      });
    if (turn === undefined) return await stopped(loop);
    span?.end("ok");
    loop.messages.push({
      role: "assistant",
      content: turn.text,
      ...(turn.toolCalls.length === 0 ? {} : { toolCalls: turn.toolCalls }),
    });
    if (turn.text !== "")
      yield { kind: "text", messageId: `${loop.runId}:${loop.steps}`, delta: turn.text };
    const final = turn.toolCalls.find((call) => call.name === OUTPUT_TOOL_NAME);
    if (final !== undefined || turn.toolCalls.length === 0) {
      const candidates =
        final === undefined
          ? textCandidates(turn.text)
          : [(final.input as { readonly value?: unknown } | undefined)?.value, final.input];
      const output = await validOutput(agent.output, candidates);
      // Every tool call in a thread gets a result, so any SDK can replay the conversation.
      for (const call of turn.toolCalls)
        loop.messages.push({
          role: "tool",
          toolCallId: call.toolCallId,
          name: call.name,
          content: call === final ? JSON.stringify(output) : JSON.stringify({ skipped: true }),
        });
      await save(loop);
      return { status: "completed", threadId: loop.threadId, output };
    }
    const interrupted = yield* continueCalls(options, loop, turn.toolCalls, new Map(), false);
    if (interrupted !== undefined) return interrupted;
  }
}

async function* continueCalls(
  options: AgentLoopOptions<string>,
  loop: Loop,
  calls: readonly AgentToolCall[],
  decisions: ReadonlyMap<string, ApprovalRecord>,
  resumeTurns = true,
): AsyncGenerator<AgentAdapterFrame, AgentRunResult | undefined> {
  const { agent, tools } = loop.context;
  for (const [index, call] of calls.entries()) {
    const toolId = tools.definitions.find((tool) => tool.name === call.name)?.id ?? call.name;
    const decision = decisions.get(call.toolCallId);
    if (decision === undefined) {
      loop.toolCalls += 1;
      if (loop.toolCalls > agent.limits.maxToolCalls) {
        throw new AgentAdapterError(
          "RELKIT_AGENT_TOOL_LIMIT",
          "The agent reached its tool call limit.",
        );
      }
      yield { kind: "tool-call", call, toolId };
    }
    const outcome = await tools.call(call, {
      signal: loop.signal,
      ...(decision === undefined ? {} : { approval: decision }),
    });
    if (outcome.status === "approval-required") {
      await save(loop, {
        runId: loop.runId,
        approvals: [outcome.approval],
        calls: calls.slice(index),
        steps: loop.steps,
        toolCalls: loop.toolCalls,
      });
      yield { kind: "approval", approvals: [outcome.approval] };
      return {
        status: "interrupted",
        threadId: loop.threadId,
        runId: loop.runId,
        approvals: [outcome.approval],
      };
    }
    yield { kind: "tool-result", outcome, toolId };
    loop.messages.push({
      role: "tool",
      toolCallId: call.toolCallId,
      name: call.name,
      content: JSON.stringify(
        outcome.status === "succeeded"
          ? (outcome.output ?? null)
          : { error: outcome.code, message: outcome.message },
      ),
    });
  }
  return resumeTurns ? yield* turns(options, loop) : undefined;
}

/** Continues pending tool calls with approval decisions, then further turns. */
export async function* resumed(
  options: AgentLoopOptions<string>,
  loop: Loop,
  calls: readonly AgentToolCall[],
  decisions: ReadonlyMap<string, ApprovalRecord>,
): AsyncGenerator<AgentAdapterFrame, AgentRunResult> {
  return (yield* continueCalls(options, loop, calls, decisions)) ?? (yield* turns(options, loop));
}

async function stopped(loop: Loop): Promise<AgentRunResult> {
  await save(loop);
  return { status: "stopped", threadId: loop.threadId, runId: loop.runId };
}

async function save(loop: Loop, pending?: AgentThreadState["pending"]): Promise<void> {
  await loop.context.state.save({
    threadId: loop.threadId,
    messages: [...loop.messages],
    ...(pending === undefined ? {} : { pending }),
  });
}
