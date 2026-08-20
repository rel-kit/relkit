import { normalizeId, type MaybePromise } from "@zsys/contracts";

export const GENERATED_AGENT_FUNCTION_PREFIX = "zsys.agent." as const;
export const GENERATED_AGENT_FUNCTION_SUFFIX = ".invoke" as const;

/** Serializable identity attached to the internal function created for an agent. */
export interface GeneratedAgentFunctionMarker {
  readonly generated: true;
  readonly generatedBy: "agent";
  readonly agentId: string;
  readonly functionId: string;
}

export type GeneratedAgentExecutor = (
  input: unknown,
  request: unknown,
  context: unknown,
) => MaybePromise<unknown>;

export type GeneratedAgentFunction = ((
  ...arguments_: readonly unknown[]
) => MaybePromise<unknown>) &
  GeneratedAgentFunctionMarker;

/** Raised when a generated identity is registered before the agent runtime binds an executor. */
export class GeneratedAgentFunctionUnboundError extends Error {
  readonly code = "ZSYS_GENERATED_FUNCTION_UNBOUND" as const;

  constructor(functionId: string) {
    super(`Generated agent function "${functionId}" has no runtime executor.`);
    this.name = "GeneratedAgentFunctionUnboundError";
  }
}

/** Derives the stable generated function ID without using the source path. */
export function generatedAgentFunctionId(agentId: unknown): string {
  return `${GENERATED_AGENT_FUNCTION_PREFIX}${normalizeId(agentId)}${GENERATED_AGENT_FUNCTION_SUFFIX}`;
}

/** Creates one marked function handler for a compiler-generated agent identity. */
export function createGeneratedAgentFunction(
  agentId: unknown,
  executor?: GeneratedAgentExecutor,
): GeneratedAgentFunction {
  const normalizedAgentId = normalizeId(agentId);
  const functionId = generatedAgentFunctionId(normalizedAgentId);
  if (executor !== undefined && typeof executor !== "function") {
    throw new TypeError("Generated agent executor must be a function");
  }
  const handler = ((...arguments_: readonly unknown[]) => {
    if (executor === undefined) throw new GeneratedAgentFunctionUnboundError(functionId);
    return executor(arguments_[0], arguments_[1], arguments_[2]);
  }) as GeneratedAgentFunction;
  Object.defineProperties(handler, {
    generated: { value: true, enumerable: true },
    generatedBy: { value: "agent", enumerable: true },
    agentId: { value: normalizedAgentId, enumerable: true },
    functionId: { value: functionId, enumerable: true },
  });
  return Object.freeze(handler);
}

export function isGeneratedAgentFunction(value: unknown): value is GeneratedAgentFunction {
  if (typeof value !== "function") return false;
  const marker = value as Partial<GeneratedAgentFunctionMarker>;
  if (
    marker.generated !== true ||
    marker.generatedBy !== "agent" ||
    typeof marker.agentId !== "string" ||
    typeof marker.functionId !== "string"
  )
    return false;
  try {
    return marker.functionId === generatedAgentFunctionId(marker.agentId);
  } catch {
    return false;
  }
}
