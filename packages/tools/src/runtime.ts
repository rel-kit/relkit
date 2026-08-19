import { normalizeId } from "@zsys/contracts";
import type { ErrorDescriptorAny } from "@zsys/functions";
import { validate, type StandardIssue, type StandardSchemaV1 } from "@zsys/schema";
import { isToolDescriptor, type ToolDescriptor, type ToolRefAny } from "./define-tool.js";

export interface ToolEngineInvocation {
  readonly functionId: string;
  readonly input: unknown;
  readonly source: "tool";
  readonly inputSchema: StandardSchemaV1;
  readonly outputSchema: StandardSchemaV1;
  readonly errors?: readonly ErrorDescriptorAny[];
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Forwarded structurally to the common engine's existing invocation hooks. */
  readonly hooks?: unknown;
  /** Forwarded structurally to preserve the parent agent span/invocation. */
  readonly parent?: unknown;
}

/** The small engine seam keeps the public tools package independent of the engine package. */
export interface ToolEngine {
  readonly invoke: (options: ToolEngineInvocation) => Promise<unknown>;
}

export type ToolSource =
  | readonly ToolDescriptor<string>[]
  | ReadonlyMap<string, ToolDescriptor<string>>
  | Readonly<Record<string, ToolDescriptor<string>>>;

export type ToolAllowlistEntry = string | ToolRefAny | ToolRefAny["ref"];

export interface ToolRuntimeOptions {
  readonly tools: ToolSource;
  readonly engine: ToolEngine;
  readonly allowedTools?: readonly ToolAllowlistEntry[];
}

export interface ToolInvocationRequest {
  readonly toolId: string;
  /** A parsed JSON value or the JSON text returned by a model. */
  readonly arguments: unknown;
  readonly signal?: AbortSignal;
  readonly hooks?: unknown;
  readonly parent?: unknown;
}

export interface ToolInvocationContext {
  readonly signal?: AbortSignal;
}

export interface ToolRuntime {
  readonly invoke: (
    toolId: string,
    arguments_: unknown,
    options?: ToolInvocationContext,
  ) => Promise<unknown>;
}

export interface ResolvedToolTarget {
  readonly functionId: string;
  readonly input: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly errors?: readonly ErrorDescriptorAny[];
}

export class ToolUnknownError extends TypeError {
  readonly code = "ZSYS_TOOL_UNKNOWN" as const;

  constructor(readonly toolId: string) {
    super(`Tool "${toolId}" is not registered`);
    this.name = "ToolUnknownError";
  }
}

export class ToolNotAllowedError extends TypeError {
  readonly code = "ZSYS_TOOL_NOT_ALLOWED" as const;

  constructor(readonly toolId: string) {
    super(`Tool "${toolId}" is not allowed for this invocation`);
    this.name = "ToolNotAllowedError";
  }
}

export class ToolArgumentValidationError extends TypeError {
  readonly code = "ZSYS_TOOL_ARGUMENT_VALIDATION" as const;
  readonly issues: readonly StandardIssue[];

  constructor(issues: readonly StandardIssue[]) {
    super("Tool arguments failed validation");
    this.name = "ToolArgumentValidationError";
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

export class ToolOperationCancelledError extends Error {
  readonly code = "ABORT_ERR" as const;

  constructor() {
    super("Tool operation cancelled");
    this.name = "AbortError";
  }
}

export function resolveToolTarget(tool: ToolDescriptor<string>): ResolvedToolTarget {
  if (!isToolDescriptor(tool)) throw new TypeError("Invalid tool descriptor");
  const target = tool.target;
  return Object.freeze({
    functionId: target.ref.id,
    input: target.input,
    output: target.output,
    ...(target.errors === undefined ? {} : { errors: target.errors }),
  });
}

/** Validates and invokes one allowlisted tool through the common engine. */
export async function invokeTool(
  options: ToolRuntimeOptions & ToolInvocationRequest,
): Promise<unknown> {
  const toolId = normalizeId(options.toolId);
  const tool = findTool(options.tools, toolId);
  if (tool === undefined || tool.id !== toolId) throw new ToolUnknownError(toolId);
  if (options.allowedTools !== undefined && !isAllowed(toolId, options.allowedTools)) {
    throw new ToolNotAllowedError(toolId);
  }
  if (options.signal?.aborted) throw new ToolOperationCancelledError();

  const target = resolveToolTarget(tool);
  const input = parseArguments(options.arguments);
  await validateArguments(target.input, input);
  return options.engine.invoke({
    functionId: target.functionId,
    input,
    source: "tool",
    inputSchema: target.input,
    outputSchema: target.output,
    ...(target.errors === undefined ? {} : { errors: target.errors }),
    ...(tool.timeoutMs === undefined ? {} : { timeoutMs: tool.timeoutMs }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
    ...(options.parent === undefined ? {} : { parent: options.parent }),
  });
}

export function createToolRuntime(options: ToolRuntimeOptions): ToolRuntime {
  const allowedTools =
    options.allowedTools === undefined ? undefined : Object.freeze([...options.allowedTools]);
  return Object.freeze({
    invoke: (toolId: string, arguments_: unknown, context: ToolInvocationContext = {}) =>
      invokeTool({
        ...options,
        toolId,
        arguments: arguments_,
        ...(allowedTools === undefined ? {} : { allowedTools }),
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      }),
  });
}

function findTool(source: ToolSource, id: string): ToolDescriptor<string> | undefined {
  if (Array.isArray(source)) return source.find((tool) => tool.id === id);
  if (source instanceof Map)
    return source.get(id) ?? [...source.values()].find((tool) => tool.id === id);
  const record = source as Readonly<Record<string, ToolDescriptor<string>>>;
  return record[id] ?? Object.values(record).find((tool) => tool.id === id);
}

function isAllowed(id: string, allowlist: readonly ToolAllowlistEntry[]): boolean {
  return allowlist.some(
    (entry) =>
      (typeof entry === "string"
        ? normalizeId(entry)
        : "ref" in entry
          ? entry.ref.id
          : entry.id) === id,
  );
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ToolArgumentValidationError([{ message: "Tool arguments must be valid JSON" }]);
  }
}

async function validateArguments(schema: StandardSchemaV1, value: unknown): Promise<void> {
  try {
    const result = await validate(schema, value as never);
    if (result.issues !== undefined) throw new ToolArgumentValidationError(result.issues);
  } catch (cause) {
    if (cause instanceof ToolArgumentValidationError) throw cause;
    throw new ToolArgumentValidationError([{ message: "Tool arguments failed validation" }]);
  }
}
