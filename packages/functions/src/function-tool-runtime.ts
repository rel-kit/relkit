import { normalizeId } from "@zsys/contracts";
import {
  abortablePromise,
  dispatchInvocation,
  getDescriptorIdentity,
  type InvocationTarget,
} from "@zsys/invocation";
import { validate, type InferInput, type InferOutput, type StandardIssue } from "@zsys/schema";
import type { FunctionRefAny } from "./types.js";
import type {
  FunctionToolApprovalRequest,
  FunctionToolInvokeOptions,
  FunctionToolMetadata,
  FunctionToolHook,
} from "./function-tool.js";

type FunctionToolRuntimeMetadata = Pick<
  FunctionToolMetadata,
  "sideEffect" | "approval" | "timeoutMs"
> & {
  readonly id: string;
  readonly onBefore?: FunctionToolHook;
  readonly onAfter?: FunctionToolHook;
};

export class FunctionToolArgumentValidationError extends TypeError {
  readonly code = "ZSYS_TOOL_ARGUMENT_VALIDATION" as const;
  readonly issues: readonly StandardIssue[];

  constructor(issues: readonly StandardIssue[]) {
    super("Tool arguments failed validation");
    this.name = "ToolArgumentValidationError";
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

export class FunctionToolOperationCancelledError extends Error {
  readonly code = "ABORT_ERR" as const;

  constructor() {
    super("Tool operation cancelled");
    this.name = "AbortError";
  }
}

export class FunctionToolApprovalRequiredError extends Error {
  readonly code = "ZSYS_APPROVAL_REQUIRED" as const;

  constructor(readonly approval: FunctionToolApprovalRequest) {
    super(`Approval required for tool "${approval.toolId}"`);
    this.name = "FunctionToolApprovalRequiredError";
  }
}

export class FunctionToolApprovalDeniedError extends Error {
  readonly code = "ZSYS_APPROVAL_DENIED" as const;

  constructor(readonly approval: FunctionToolApprovalRequest) {
    super(`Approval denied for tool "${approval.toolId}"`);
    this.name = "FunctionToolApprovalDeniedError";
  }
}

export function createFunctionToolInvoker<Target extends FunctionRefAny>(
  target: Target,
  metadata: FunctionToolRuntimeMetadata,
  identity?: object,
): (
  input: InferInput<Target["input"]>,
  options?: FunctionToolInvokeOptions,
) => Promise<InferOutput<Target["output"]>> {
  return async (input, options = {}) => {
    const toolId =
      identity === undefined ? normalizeId(metadata.id) : getDescriptorIdentity(identity);
    const validatedInput = await validateToolInput(target.input, input);
    if (options.signal?.aborted) throw new FunctionToolOperationCancelledError();
    const approval = Object.freeze({
      toolId,
      sideEffect: metadata.sideEffect,
      policy: metadata.approval,
    }) satisfies FunctionToolApprovalRequest;
    await resolveApproval(approval, options);
    const result = dispatchInvocation({
      target: target as unknown as InvocationTarget,
      input: validatedInput,
      options: {
        source: "tool",
        ...(metadata.timeoutMs === undefined ? {} : { timeoutMs: metadata.timeoutMs }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(metadata.onBefore === undefined && metadata.onAfter === undefined
          ? {}
          : {
              toolHooks: {
                ...(metadata.onBefore === undefined ? {} : { onBefore: metadata.onBefore }),
                ...(metadata.onAfter === undefined ? {} : { onAfter: metadata.onAfter }),
              },
            }),
      },
    });
    return result as Promise<InferOutput<Target["output"]>>;
  };
}

async function validateToolInput(schema: TargetSchema, input: unknown): Promise<unknown> {
  try {
    const result = await validate(schema, input as never);
    if (result.issues !== undefined) throw new FunctionToolArgumentValidationError(result.issues);
    return result.value;
  } catch (cause) {
    if (cause instanceof FunctionToolArgumentValidationError) throw cause;
    throw new FunctionToolArgumentValidationError([
      { message: "Tool arguments failed validation" },
    ]);
  }
}

async function resolveApproval(
  approval: FunctionToolApprovalRequest,
  options: FunctionToolInvokeOptions,
): Promise<void> {
  if (!requiresApproval(approval.policy, approval.sideEffect)) return;
  const resolver = options.approval;
  if (resolver === undefined) throw new FunctionToolApprovalRequiredError(approval);
  const decision =
    options.signal === undefined
      ? await resolver(approval)
      : await abortablePromise(options.signal, () => Promise.resolve(resolver(approval)));
  if (decision !== true && decision !== "approved") {
    throw new FunctionToolApprovalDeniedError(approval);
  }
}

function requiresApproval(
  policy: FunctionToolApprovalRequest["policy"],
  sideEffect: FunctionToolApprovalRequest["sideEffect"],
): boolean {
  return (
    policy === "always" || (policy === "on-write" && sideEffect !== "none" && sideEffect !== "read")
  );
}

type TargetSchema = FunctionRefAny["input"];
