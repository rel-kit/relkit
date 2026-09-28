import { isLangChainTool } from "@langchain/core/tools";
import { isToolRef, type ToolRefAny } from "@relkit/tools";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { agentDefinitionFailure } from "./define-agent-error.js";
import type { AgentTool, NativeAgentTool } from "./define-agent-native.types.js";

/** Validates and freezes RELKIT and native agent tools in input order.
 * @param value - Tool references and native tools.
 * @returns An Effect with a frozen list or AgentDefinitionFailure.
 * @example Effect.runSync(copyAgentToolsEffect([]));
 */
export const copyAgentToolsEffect = Effect.fn("Agents.definition.copyTools")(
  <Tools extends readonly AgentTool[]>(value: Tools) => Effect.try({
    try: (): Tools => {
      if (!Array.isArray(value)) throw new TypeError("Agent tools must be an array");
      const ids = new Set<string>();
      const tools = value.map((entry, index) => {
        if (isToolRef(entry)) {
          const id = entry.ref.id;
          duplicate(ids, id);
          return Object.freeze({ ref: Object.freeze({ kind: "tool" as const, id }) });
        }
        if (!isNativeAgentTool(entry)) {
          throw new TypeError(`Agent tool at index ${index} is invalid`);
        }
        const name = nativeToolName(entry);
        if (name !== undefined) duplicate(ids, name);
        return entry;
      });
      return Object.freeze(tools) as unknown as Tools;
    },
    catch: agentDefinitionFailure,
  }),
  (effect) => observeAgent("definition.copy-tools", effect),
);

/** Copies tools for existing synchronous authoring callers.
 * @param value - Tool references and native tools.
 * @returns A frozen tool list.
 * @throws The original invalid or duplicate tool error.
 * @example const tools = copyAgentTools([]);
 */
export function copyAgentTools<Tools extends readonly AgentTool[]>(value: Tools): Tools {
  return Effect.runSync(copyAgentToolsEffect(value).pipe(
    Effect.catchTag("AgentDefinitionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

/** Selects RELKIT tool references from a mixed native tool list.
 * @param tools - Agent tool list.
 * @returns An Effect with RELKIT references and no typed failure.
 * @example Effect.runSync(relkitToolRefsEffect([]));
 */
export const relkitToolRefsEffect = Effect.fn("Agents.definition.toolRefs")(
  (tools: readonly AgentTool[]) => Effect.sync(() => tools.filter(isToolRef)),
  (effect) => observeAgent("definition.tool-refs", effect),
);

/** Selects RELKIT references for existing synchronous authoring callers.
 * @param tools - Agent tool list.
 * @returns RELKIT tool references in input order.
 * @example const refs = relkitToolRefs(tools);
 */
export function relkitToolRefs(tools: readonly AgentTool[]): readonly ToolRefAny[] {
  return Effect.runSync(relkitToolRefsEffect(tools));
}

function isNativeAgentTool(value: unknown): value is NativeAgentTool {
  return isLangChainTool(value) || (isRecord(value) && typeof value.type === "string");
}

function nativeToolName(value: NativeAgentTool): string | undefined {
  return "name" in value && typeof value.name === "string" ? value.name : undefined;
}

function duplicate(ids: Set<string>, id: string): void {
  if (ids.has(id)) throw new TypeError(`Duplicate agent tool "${id}"`);
  ids.add(id);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
