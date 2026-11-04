/**
 * Builds and recognizes agent adapter values. Adapter packages call `defineAgentRuntime` from their
 * authoring entry, so declaring an agent never loads an execution SDK.
 */
import type {
  AgentAdapterDefinitionInput,
  AgentRuntimeAdapter,
  AgentRuntimeReference,
} from "./adapter.types.js";

export type * from "./adapter.types.js";
export { agUiEvents } from "./adapter-events.js";
export { createAgentToolBridge, modelToolName } from "./adapter-bridge.js";
export { AgentAdapterError, createAgentAdapterRuntime } from "./adapter-loop.js";
export type { AgentToolBridgeOptions } from "./adapter-bridge.types.js";
export type { AgentLoopOptions } from "./adapter-loop.types.js";

/** Options an adapter package passes to `defineAgentRuntime`. @experimental */
export interface DefineAgentRuntimeOptions<
  AdapterId extends string,
  Options,
  StateKey extends string,
> {
  readonly adapterId: AdapterId;
  readonly integrationId: string;
  readonly options: Options;
  /** Adapter-specific option keys this value uses; they tie the agent to the adapter. */
  readonly nativeOptions?: readonly string[];
  readonly clientStateKeys?: readonly StateKey[];
  readonly extend?: (input: AgentAdapterDefinitionInput) => Readonly<Record<string, unknown>>;
}

/**
 * Creates the frozen value an agent's `runtime` field holds.
 * @param options - Adapter identity, its options and an optional descriptor extension.
 * @returns A frozen adapter value.
 * @example
 * ```ts
 * import { defineAgentRuntime } from "relkit/agent-adapters";
 *
 * const runtime = defineAgentRuntime({ adapterId: "echo", integrationId: "echo", options: {} });
 * void runtime;
 * ```
 * @experimental
 */
export function defineAgentRuntime<
  const AdapterId extends string,
  Options,
  Native extends object = {},
  const StateKey extends string = never,
>(
  options: DefineAgentRuntimeOptions<AdapterId, Options, StateKey>,
): AgentRuntimeAdapter<AdapterId, Options, Native, StateKey> {
  if (!/^[a-z][a-z0-9-]*$/u.test(options.adapterId)) {
    throw new TypeError("Agent adapter IDs use lowercase letters, digits and dashes");
  }
  if (options.integrationId.trim() === "") {
    throw new TypeError("Agent adapters require an integration ID");
  }
  return Object.freeze({
    kind: "agent-runtime" as const,
    adapterId: options.adapterId,
    integrationId: options.integrationId,
    protocolVersion: 1 as const,
    nativeOptions: Object.freeze([...(options.nativeOptions ?? [])].sort()),
    clientStateKeys: Object.freeze([...(options.clientStateKeys ?? [])]),
    options: options.options,
    ...(options.extend === undefined ? {} : { extend: options.extend }),
  });
}

/**
 * Recognizes an agent adapter value.
 * @param value - Candidate `runtime` field.
 * @returns True for values created by `defineAgentRuntime`.
 * @example isAgentRuntimeAdapter(runtime);
 * @experimental
 */
export function isAgentRuntimeAdapter(value: unknown): value is AgentRuntimeAdapter {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<AgentRuntimeAdapter>;
  return (
    candidate.kind === "agent-runtime" &&
    typeof candidate.adapterId === "string" &&
    typeof candidate.integrationId === "string" &&
    candidate.protocolVersion === 1 &&
    Array.isArray(candidate.nativeOptions)
  );
}

/**
 * Copies the serializable adapter identity stored on descriptors and graph nodes.
 * @param runtime - Adapter value from `defineAgent`.
 * @returns A frozen reference without options or functions.
 * @example agentRuntimeReference(runtime).adapterId;
 * @experimental
 */
export function agentRuntimeReference(runtime: AgentRuntimeAdapter): AgentRuntimeReference {
  return Object.freeze({
    kind: "agent-runtime",
    adapterId: runtime.adapterId,
    integrationId: runtime.integrationId,
    protocolVersion: 1,
    nativeOptions: Object.freeze([...runtime.nativeOptions]),
  });
}
