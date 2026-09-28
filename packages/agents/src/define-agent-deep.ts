import { isAgentDescriptor } from "./define-agent-validation.js";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { agentDefinitionFailure } from "./define-agent-error.js";
import type { AgentSubagent, DeepAgentCapabilities } from "./define-agent-deep.types.js";

export type * from "./define-agent-deep.types.js";

/** Validates and freezes native DeepAgents options.
 * @param value - Optional subagents, paths, backend, persistence, and HITL controls.
 * @returns An Effect with copied capabilities or AgentDefinitionFailure.
 * @example Effect.runSync(copyDeepAgentCapabilitiesEffect({ skills: ["/skills"] }));
 */
export const copyDeepAgentCapabilitiesEffect = Effect.fn("Agents.definition.copyDeep")(
  (value: DeepAgentCapabilities) =>
    Effect.try({
      try: () => copyDeepAgentCapabilitiesValue(value),
      catch: agentDefinitionFailure,
    }),
  (effect) => observeAgent("definition.copy-deep", effect),
);

/** Copies DeepAgents options for existing synchronous authoring callers.
 * @param value - Optional subagents, paths, backend, persistence, and HITL controls.
 * @returns Immutable capabilities.
 * @throws The original invalid capability error.
 * @example const options = copyDeepAgentCapabilities({ skills: ["/skills"] });
 */
export function copyDeepAgentCapabilities(value: DeepAgentCapabilities): DeepAgentCapabilities {
  return Effect.runSync(
    copyDeepAgentCapabilitiesEffect(value).pipe(
      Effect.catchTag("AgentDefinitionFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

function copyDeepAgentCapabilitiesValue(value: DeepAgentCapabilities): DeepAgentCapabilities {
  const subagents = copySubagents(value.subagents);
  const skills = copyPaths(value.skills, "skills");
  const memory = copyPaths(value.memory, "memory");
  const backend = value.backend;
  if (
    backend !== undefined &&
    (typeof backend !== "object" || backend === null) &&
    typeof backend !== "function"
  ) {
    throw new TypeError("Agent backend must be a native DeepAgents backend");
  }
  const interruptOn = copyInterruptOn(value.interruptOn);
  if (interruptOn !== undefined && value.checkpointer === undefined) {
    throw new TypeError("Agent interruptOn requires a checkpointer");
  }
  return Object.freeze({
    ...(subagents === undefined ? {} : { subagents }),
    ...(skills === undefined ? {} : { skills }),
    ...(memory === undefined ? {} : { memory }),
    ...(backend === undefined ? {} : { backend }),
    ...(value.checkpointer === undefined ? {} : { checkpointer: value.checkpointer }),
    ...(value.store === undefined ? {} : { store: value.store }),
    ...(interruptOn === undefined ? {} : { interruptOn }),
  });
}

/** Checks whether a descriptor enables native DeepAgents capabilities.
 * @param value - Capabilities to inspect.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(hasDeepAgentCapabilitiesEffect({ skills: ["/skills"] }));
 */
export const hasDeepAgentCapabilitiesEffect = Effect.fn("Agents.definition.hasDeep")(
  (value: DeepAgentCapabilities) => Effect.sync(() => hasDeepAgentCapabilitiesValue(value)),
  (effect) => observeAgent("definition.has-deep", effect),
);

/** Checks capabilities for existing synchronous authoring callers.
 * @param value - Capabilities to inspect.
 * @returns Whether native DeepAgents behavior is requested.
 * @example if (hasDeepAgentCapabilities(options)) enableDeep();
 */
export function hasDeepAgentCapabilities(value: DeepAgentCapabilities): boolean {
  return Effect.runSync(hasDeepAgentCapabilitiesEffect(value));
}

function hasDeepAgentCapabilitiesValue(value: DeepAgentCapabilities): boolean {
  return (
    value.subagents !== undefined ||
    value.skills !== undefined ||
    value.memory !== undefined ||
    value.backend !== undefined ||
    value.interruptOn !== undefined
  );
}

function copyInterruptOn(
  value: DeepAgentCapabilities["interruptOn"],
): DeepAgentCapabilities["interruptOn"] {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Agent interruptOn must be an object");
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([tool, config]) => {
        if (tool.trim() === "") throw new TypeError("Agent interruptOn tool names cannot be empty");
        if (typeof config === "boolean") return [tool, config];
        if (typeof config !== "object" || config === null || Array.isArray(config)) {
          throw new TypeError(`Agent interruptOn.${tool} must be boolean or an object`);
        }
        const allowed = config.allowedDecisions;
        if (!Array.isArray(allowed) || allowed.length === 0) {
          throw new TypeError(`Agent interruptOn.${tool}.allowedDecisions cannot be empty`);
        }
        if (
          allowed.some((decision) => !["approve", "edit", "reject"].includes(decision)) ||
          new Set(allowed).size !== allowed.length
        ) {
          throw new TypeError(`Agent interruptOn.${tool}.allowedDecisions is invalid`);
        }
        return [tool, Object.freeze({ ...config, allowedDecisions: Object.freeze([...allowed]) })];
      }),
    ),
  );
}

function copySubagents(value: unknown): readonly AgentSubagent[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError("Agent subagents must be an array");
  const ids = new Set<string>();
  for (const [index, subagent] of value.entries()) {
    if (!isAgentDescriptor(subagent)) {
      throw new TypeError(`Agent subagent at index ${index} must be an agent descriptor`);
    }
    if (ids.has(subagent.id)) throw new TypeError(`Duplicate agent subagent "${subagent.id}"`);
    ids.add(subagent.id);
  }
  return Object.freeze([...value]);
}

function copyPaths(value: unknown, name: "skills" | "memory"): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError(`Agent ${name} must be an array`);
  const paths = value.map((entry) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new TypeError(`Agent ${name} paths must be non-empty text`);
    }
    return entry;
  });
  if (new Set(paths).size !== paths.length)
    throw new TypeError(`Agent ${name} paths must be unique`);
  return Object.freeze(paths);
}
