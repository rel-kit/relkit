import type { MaybePromise } from "@relkit/contracts";

/** Serializable identity attached to an agent-generated function. */
export interface GeneratedAgentFunctionMarker {
  readonly generated: true;
  readonly generatedBy: "agent";
  readonly agentId: string;
  readonly functionId: string;
}

/** Optional executor bound when the generated function is registered. */
export type GeneratedAgentExecutor = (input: unknown, context: unknown) => MaybePromise<unknown>;

/** Callable handler with a compiler-visible agent identity marker. */
export type GeneratedAgentFunction = ((
  ...arguments_: readonly unknown[]
) => MaybePromise<unknown>) &
  GeneratedAgentFunctionMarker;
