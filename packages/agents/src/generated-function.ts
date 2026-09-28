import { normalizeId } from "@relkit/contracts";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { generatedAgentFunctionFailure } from "./generated-function-error.js";
import type { GeneratedAgentExecutor, GeneratedAgentFunction, GeneratedAgentFunctionMarker } from "./generated-function.types.js";

export type * from "./generated-function.types.js";

export const GENERATED_AGENT_FUNCTION_PREFIX = "relkit.agent." as const;
export const GENERATED_AGENT_FUNCTION_SUFFIX = ".invoke" as const;

/** Raised when a generated identity is registered before the agent runtime binds an executor. */
export class GeneratedAgentFunctionUnboundError extends Error {
  readonly code = "RELKIT_GENERATED_FUNCTION_UNBOUND" as const;

  constructor(functionId: string) {
    super(`Generated agent function "${functionId}" has no runtime executor.`);
    this.name = "GeneratedAgentFunctionUnboundError";
  }
}

/** Derives the stable generated function ID without using the source path.
 * @param agentId - Stable agent identity.
 * @returns An Effect with the function ID or GeneratedAgentFunctionFailure.
 * @example Effect.runSync(generatedAgentFunctionIdEffect("support"));
 */
export const generatedAgentFunctionIdEffect = Effect.fn("Agents.generated.id")(
  (agentId: unknown) => Effect.try({
    try: () => generatedAgentFunctionIdValue(agentId),
    catch: generatedAgentFunctionFailure,
  }),
  (effect) => observeAgent("generated.id", effect),
);

/** Derives the generated function ID for existing synchronous callers.
 * @param agentId - Stable agent identity.
 * @returns Generated function ID.
 * @throws The original invalid identity error.
 * @example generatedAgentFunctionId("support");
 */
export function generatedAgentFunctionId(agentId: unknown): string {
  return Effect.runSync(generatedAgentFunctionIdEffect(agentId).pipe(
    Effect.catchTag("GeneratedAgentFunctionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function generatedAgentFunctionIdValue(agentId: unknown): string {
  return `${GENERATED_AGENT_FUNCTION_PREFIX}${normalizeId(agentId)}${GENERATED_AGENT_FUNCTION_SUFFIX}`;
}

/** Creates a marked function handler for a compiler-generated agent identity.
 * @param agentId - Stable agent identity.
 * @param executor - Optional runtime executor; absence creates an unbound handler.
 * @returns An Effect with a frozen marked handler or GeneratedAgentFunctionFailure.
 * @example Effect.runSync(createGeneratedAgentFunctionEffect("support", executor));
 */
export const createGeneratedAgentFunctionEffect = Effect.fn("Agents.generated.create")(
  (agentId: unknown, executor?: GeneratedAgentExecutor) => Effect.try({
    try: () => createGeneratedAgentFunctionValue(agentId, executor),
    catch: generatedAgentFunctionFailure,
  }),
  (effect) => observeAgent("generated.create", effect),
);

/** Creates a marked handler for existing synchronous callers.
 * @param agentId - Stable agent identity.
 * @param executor - Optional runtime executor.
 * @returns A frozen marked handler.
 * @throws The original invalid identity or executor error.
 * @example createGeneratedAgentFunction("support", executor);
 */
export function createGeneratedAgentFunction(
  agentId: unknown,
  executor?: GeneratedAgentExecutor,
): GeneratedAgentFunction {
  return Effect.runSync(createGeneratedAgentFunctionEffect(agentId, executor).pipe(
    Effect.catchTag("GeneratedAgentFunctionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function createGeneratedAgentFunctionValue(agentId: unknown, executor?: GeneratedAgentExecutor): GeneratedAgentFunction {
  const normalizedAgentId = normalizeId(agentId);
  const functionId = generatedAgentFunctionIdValue(normalizedAgentId);
  if (executor !== undefined && typeof executor !== "function") {
    throw new TypeError("Generated agent executor must be a function");
  }
  const handler = ((...arguments_: readonly unknown[]) => {
    if (executor === undefined) throw new GeneratedAgentFunctionUnboundError(functionId);
    return executor(arguments_[0], arguments_[1]);
  }) as GeneratedAgentFunction;
  Object.defineProperties(handler, {
    generated: { value: true, enumerable: true },
    generatedBy: { value: "agent", enumerable: true },
    agentId: { value: normalizedAgentId, enumerable: true },
    functionId: { value: functionId, enumerable: true },
  });
  return Object.freeze(handler);
}

/** Checks whether a callable has a valid generated agent marker.
 * @param value - Candidate callable.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(isGeneratedAgentFunctionEffect(candidate));
 */
export const isGeneratedAgentFunctionEffect = Effect.fn("Agents.generated.isFunction")(
  (value: unknown) => Effect.sync(() => isGeneratedAgentFunctionValue(value)),
  (effect) => observeAgent("generated.is-function", effect),
);

/** Checks a generated marker for existing synchronous callers.
 * @param value - Candidate callable.
 * @returns Whether the callable has a valid marker.
 * @example if (isGeneratedAgentFunction(candidate)) use(candidate);
 */
export function isGeneratedAgentFunction(value: unknown): value is GeneratedAgentFunction {
  return Effect.runSync(isGeneratedAgentFunctionEffect(value));
}

function isGeneratedAgentFunctionValue(value: unknown): boolean {
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
    return marker.functionId === generatedAgentFunctionIdValue(marker.agentId);
  } catch {
    return false;
  }
}
