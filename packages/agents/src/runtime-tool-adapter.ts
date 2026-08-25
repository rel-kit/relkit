import {
  currentInvocationScope,
  resolveDescriptorIdentity,
  runInInvocationScope,
  type InvocationDispatchRequest,
  type InvocationDispatcher,
} from "@zsys/invocation";
import { getJsonSchema, validate, type StandardSchemaV1 } from "@zsys/schema";
import {
  assertApprovalGranted,
  approveApproval,
  createApproval,
  denyApproval,
  type ApprovalRecord,
} from "./approval.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";
import type { AgentToolCall } from "./runtime-tools.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { withSignal } from "./runtime-utils.js";
import type {
  ToolApprovalRequest,
  ToolDescriptor,
  ToolEngine,
  ToolEngineInvocation,
} from "@zsys/tools";
import type { FlexibleSchema } from "ai";

export function createAiInputSchema(schema: StandardSchemaV1): FlexibleSchema<unknown> {
  const projection = getJsonSchema(schema);
  if (!projection.ok) {
    throw new AgentRuntimeError("ZSYS_SCHEMA_UNAVAILABLE", "Tool input schema is unavailable");
  }
  return {
    "~standard": {
      version: 1,
      vendor: "zsys",
      validate: async (value: unknown) => {
        const result = await validate(schema, value as never);
        // ZSYS tool.invoke owns canonical parsing, including transforms and defaults.
        return "value" in result ? { value } : { issues: result.issues };
      },
      jsonSchema: {
        input: () => projection.schema,
        output: () => projection.schema,
      },
    },
  } as unknown as FlexibleSchema<unknown>;
}

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
  const invoke = () =>
    tool.invoke(turn.input, {
      signal,
      approval: (request) =>
        resolveAgentApproval(options, request, turn.callId, invocationId, signal),
    });
  if (currentInvocationScope() !== undefined) return invoke();
  return runInInvocationScope(
    {
      dispatcher: createAgentToolDispatcher(
        engine,
        options,
        invocationId,
        traceId,
        parentSpanId,
        signal,
      ),
      parent: {
        id: invocationId,
        traceId: traceId ?? invocationId,
        signal,
        ...(parentSpanId === undefined ? {} : { spanId: parentSpanId }),
      },
    },
    invoke,
  );
}

async function resolveAgentApproval(
  options: AgentRuntimeOptions & AgentInvocationOptions,
  request: ToolApprovalRequest,
  toolCallId: string,
  invocationId: string,
  signal: AbortSignal,
): Promise<true> {
  const approval = createApproval({
    invocationId,
    toolCallId,
    toolId: request.toolId,
    sideEffect: request.sideEffect,
    policy: request.policy,
  });
  if (approval.state !== "pending") return true;
  const handler = options.approval;
  if (handler === undefined) {
    assertApprovalGranted(approval);
    return true;
  }
  const response = await withSignal(handler(approval), signal);
  const decision: ApprovalRecord =
    response === "approved" || response === true
      ? approveApproval(approval)
      : response === "denied" || response === false
        ? denyApproval(approval)
        : response;
  assertApprovalGranted(decision);
  return true;
}

function createAgentToolDispatcher(
  engine: ToolEngine,
  options: AgentRuntimeOptions & AgentInvocationOptions,
  invocationId: string,
  traceId: string | undefined,
  parentSpanId: string | undefined,
  signal: AbortSignal,
): InvocationDispatcher {
  const parent = {
    id: invocationId,
    traceId: traceId ?? invocationId,
    signal,
    ...(parentSpanId === undefined ? {} : { spanId: parentSpanId }),
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
        parent,
      } satisfies ToolEngineInvocation;
      return engine.invoke(invocation) as Promise<Output>;
    },
  });
}
