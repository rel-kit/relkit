import type { ClientTool, ServerTool } from "@langchain/core/tools";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";

/** Native tools and public identity mapping for one invocation. */
export interface NativeTools {
  readonly values: readonly (ClientTool | ServerTool)[];
  readonly publicIds: ReadonlyMap<string, string>;
  readonly relkitNames: ReadonlySet<string>;
  readonly failure: () => unknown;
}

/** Runtime context used to materialize native tools. */
export type NativeToolRuntimeOptions = AgentRuntimeOptions & AgentInvocationOptions;

/** Replaceable identity source for native tool calls. */
export interface NativeToolIdentityService {
  /** Creates a call identity when LangChain does not supply one.
   * @returns A UUID.
   * @example identity.randomUUID();
   */
  readonly randomUUID: () => string;
}
