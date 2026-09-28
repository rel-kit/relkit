import type { ErrorDescriptorAny } from "@relkit/functions";
import type { ProgressSink } from "@relkit/invocation";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { ToolDescriptor, ToolRefAny } from "./define-tool.types.js";

/** Invocation forwarded to the common function engine.
 * @example const invocation: ToolEngineInvocation = { functionId: "orders.lookup", input: {}, source: "tool", inputSchema, outputSchema };
 */
export interface ToolEngineInvocation {
  readonly functionId: string;
  readonly input: unknown;
  readonly source: "tool";
  readonly inputSchema: StandardSchemaV1;
  readonly outputSchema: StandardSchemaV1;
  readonly errors?: readonly ErrorDescriptorAny[];
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly hooks?: unknown;
  readonly toolHooks?: unknown;
  readonly progressSink?: ProgressSink;
  readonly parent?: unknown;
}

/** Small engine seam that keeps tools independent of the engine package.
 * @example const engine: ToolEngine = { invoke: async (request) => request.input };
 */
export interface ToolEngine {
  /** Invoke a validated target through the common engine.
   * @param options - Target schemas, input, and inherited invocation context.
   * @returns The function output or an engine rejection.
   * @example await engine.invoke(invocation);
   */
  readonly invoke: (options: ToolEngineInvocation) => Promise<unknown>;
}

/** Supported tool collections.
 * @example const tools: ToolSource = [tool];
 */
export type ToolSource =
  | readonly ToolDescriptor<string>[]
  | ReadonlyMap<string, ToolDescriptor<string>>
  | Readonly<Record<string, ToolDescriptor<string>>>;
/** One allowed tool ID or reference.
 * @example const allowed: ToolAllowlistEntry = "orders.lookup.tool";
 */
export type ToolAllowlistEntry = string | ToolRefAny | ToolRefAny["ref"];

/** Runtime dependencies and optional allowlist.
 * @example const options: ToolRuntimeOptions = { tools: [tool], engine };
 */
export interface ToolRuntimeOptions {
  readonly tools: ToolSource;
  readonly engine: ToolEngine;
  readonly allowedTools?: readonly ToolAllowlistEntry[];
}

/** Effect invocation input; the engine arrives from ToolEngineService.
 * @example const request: ToolEffectOptions = { tools: [tool], toolId: tool.id, arguments: {} };
 */
export type ToolEffectOptions = Omit<ToolRuntimeOptions, "engine"> & ToolInvocationRequest;

/** Input for one engine-backed tool invocation.
 * @example const request: ToolInvocationRequest = { toolId: "orders.lookup", arguments: {} };
 */
export interface ToolInvocationRequest {
  readonly toolId: string;
  /** Parsed JSON or model-returned JSON text. */
  readonly arguments: unknown;
  readonly signal?: AbortSignal;
  readonly hooks?: unknown;
  readonly parent?: unknown;
}

/** Optional cancellation context for a runtime call.
 * @example const context: ToolInvocationContext = { signal: controller.signal };
 */
export interface ToolInvocationContext {
  readonly signal?: AbortSignal;
}

/** Reusable Promise compatibility runtime.
 * @example await runtime.invoke("orders.lookup", { id: "a" });
 */
export interface ToolRuntime {
  /** Invoke one registered tool.
   * @param toolId - Canonical tool ID.
   * @param arguments_ - Parsed input or JSON text.
   * @param options - Optional cancellation context.
   * @returns Engine output or a rejected compatibility error.
   * @example await runtime.invoke("orders.lookup.tool", { id: "one" });
   */
  readonly invoke: (
    toolId: string,
    arguments_: unknown,
    options?: ToolInvocationContext,
  ) => Promise<unknown>;
}

/** Function target and schemas resolved from a tool.
 * @example const target: ResolvedToolTarget = resolveToolTarget(tool);
 */
export interface ResolvedToolTarget {
  readonly functionId: string;
  readonly input: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly errors?: readonly ErrorDescriptorAny[];
}
