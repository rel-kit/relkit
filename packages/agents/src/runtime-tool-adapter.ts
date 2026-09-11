import {
  currentInvocationScope,
  currentExecutionContext,
  resolveDescriptorIdentity,
  runInInvocationScope,
  type InvocationDispatchRequest,
  type InvocationDispatcher,
} from "@relkit/invocation";
import { validate } from "@relkit/schema";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";
import type { AgentToolCall } from "./runtime-tools.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { ApprovalDeniedError } from "./approval.js";
import { emitTool, resolveAgentApproval } from "./runtime-tool-events.js";
import type { ToolDescriptor, ToolEngine, ToolEngineInvocation } from "@relkit/tools";

export async function invokeAgentTool(
  engine: ToolEngine,
  tool: ToolDescriptor<string>,
  turn: AgentToolCall,
  options: AgentRuntimeOptions & AgentInvocationOptions,
  signal: AbortSignal,
  invocationId: string,
  traceId?: string,
  parentSpanId?: string,
): Promise<unknown> {
  const parsed = await validate(tool.target.input, turn.input as never);
  if (!("value" in parsed))
    throw new AgentRuntimeError("RELKIT_AGENT_INPUT_VALIDATION", "Tool input validation failed");
  await emitTool(options, turn, "started", undefined, signal);
  await emitTool(options, turn, "input-ready", parsed.value, signal);
  const approvalRequired =
    tool.approval === "always" || (tool.approval === "on-write" && tool.sideEffect === "write");
  if (!approvalRequired) await emitTool(options, turn, "running", undefined, signal);
  const invoke = () =>
    tool.invoke(turn.input, {
      signal,
      approval: (request) =>
        resolveAgentApproval(options, request, turn.callId, invocationId, signal),
    });
  const progressSink = options.contentSink?.progressSinkForTool?.({
    toolCallId: turn.callId,
    toolId: turn.toolId,
  });
  try {
    const current = currentInvocationScope();
    const baseDispatcher =
      current?.dispatcher ??
      createAgentInvocationDispatcher(engine, options, invocationId, traceId, parentSpanId, signal);
    const dispatcher =
      progressSink === undefined ? baseDispatcher : withProgressSink(baseDispatcher, progressSink);
    const result = await runInInvocationScope(
      current === undefined
        ? {
            dispatcher,
            parent: {
              id: invocationId,
              traceId: traceId ?? invocationId,
              signal,
              ...(parentSpanId === undefined ? {} : { spanId: parentSpanId }),
            },
          }
        : { ...current, dispatcher },
      invoke,
    );
    await emitTool(options, turn, "succeeded", result, signal);
    return result;
  } catch (error) {
    const state = error instanceof ApprovalDeniedError ? "denied" : "failed";
    await emitTool(options, turn, state, undefined, signal).catch(() => undefined);
    throw error;
  }
}

export function createAgentInvocationDispatcher(
  engine: ToolEngine,
  options: AgentRuntimeOptions & AgentInvocationOptions,
  invocationId: string,
  traceId: string | undefined,
  parentSpanId: string | undefined,
  signal: AbortSignal,
): InvocationDispatcher {
  const active = currentExecutionContext();
  const parent = {
    id: invocationId,
    traceId: active?.span.traceId ?? traceId ?? invocationId,
    signal,
    ...(active?.span.spanId === undefined && parentSpanId === undefined
      ? {}
      : { spanId: active?.span.spanId ?? parentSpanId }),
  };
  return Object.freeze({
    dispatch: <Input, Output, Context extends { readonly signal: AbortSignal }>(
      request: InvocationDispatchRequest<Input, Output, Context>,
    ) => {
      const target = request.target;
      const invocation = {
        functionId: resolveDescriptorIdentity(target).id,
        input: request.input,
        source: "tool" as const,
        inputSchema: target.input,
        outputSchema: target.output,
        ...(target.errors === undefined
          ? {}
          : { errors: target.errors as NonNullable<ToolEngineInvocation["errors"]> }),
        ...(request.options?.timeoutMs === undefined
          ? {}
          : { timeoutMs: request.options.timeoutMs }),
        signal: request.options?.signal ?? signal,
        ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
        ...(request.options?.toolHooks === undefined
          ? {}
          : { toolHooks: request.options.toolHooks }),
        ...(request.options?.progressSink === undefined
          ? {}
          : { progressSink: request.options.progressSink }),
        parent,
      } satisfies ToolEngineInvocation;
      return engine.invoke(invocation) as Promise<Output>;
    },
  });
}

function withProgressSink(
  dispatcher: InvocationDispatcher,
  progressSink: NonNullable<ToolEngineInvocation["progressSink"]>,
): InvocationDispatcher {
  const scoped: InvocationDispatcher = {
    dispatch: <Input, Output, Context extends { readonly signal: AbortSignal }>(
      request: InvocationDispatchRequest<Input, Output, Context>,
    ): Promise<Output> =>
      dispatcher.dispatch({
        ...request,
        options: { ...request.options, progressSink },
      }),
  };
  return Object.freeze(scoped);
}
