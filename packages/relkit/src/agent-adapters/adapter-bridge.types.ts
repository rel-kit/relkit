/** Inputs of the RelKit-owned tool bridge an adapter run calls for every model tool call. */
import type { ToolDescriptor, ToolEngine } from "../tools/index.js";
import type { AgentAccessCheck, AgentTraceHooks } from "./adapter.types.js";

/** Options for `createAgentToolBridge`. @experimental */
export interface AgentToolBridgeOptions {
  readonly agentId: string;
  /** Invocation identity copied into approval records. */
  readonly invocationId: string;
  /** Tool descriptors the agent declared, in declaration order. */
  readonly tools: readonly ToolDescriptor<string>[];
  /** Common function engine every tool call runs through. */
  readonly engine: ToolEngine;
  /** Engine access check run before each tool; group 18's access rules plug in here. */
  readonly access?: AgentAccessCheck;
  /** Caller principal forwarded to the access check. */
  readonly principal?: unknown;
  readonly trace?: AgentTraceHooks;
}
