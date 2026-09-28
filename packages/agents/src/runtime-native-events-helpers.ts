import type { ProtocolEvent } from "@langchain/langgraph";
import { publicToolValue, type NativeExecutionContext } from "./runtime-native-public.js";

/** Tracks agent and subagent identity from native protocol events.
 * @param event - Native event.
 * @param contexts - Mutable scope context map.
 * @returns Nothing; the context map is updated when identity is present.
 * @example trackExecutionContext(event, contexts);
 */
export function trackExecutionContext(event: ProtocolEvent, contexts: Map<string, NativeExecutionContext>): void {
  const data = event.params.data;
  if (!isRecord(data)) return;
  const key = scopeKey(event.params.namespace);
  if (event.method === "tasks" && isRecord(data.metadata)) {
    const agent = data.metadata.lc_agent_name;
    if (typeof agent === "string" && agent !== "") contexts.set(key, { ...contexts.get(key), agent });
    return;
  }
  if (event.method !== "tools" || data.event !== "tool-started" || data.tool_name !== "task" ||
    typeof data.tool_call_id !== "string") return;
  const input = publicToolValue(data.input);
  if (!isRecord(input) || typeof input.subagent_type !== "string") return;
  contexts.set(key, {
    agent: input.subagent_type,
    parent: { kind: "tool", toolCallId: data.tool_call_id, toolId: "task" },
  });
}

/** Resolves the nearest execution context for a nested event.
 * @param event - Native event.
 * @param contexts - Recorded scope contexts.
 * @returns Nearest context or an empty context.
 * @example executionContext(event, contexts);
 */
export function executionContext(
  event: ProtocolEvent, contexts: ReadonlyMap<string, NativeExecutionContext>,
): NativeExecutionContext {
  for (let length = event.params.namespace.length; length >= 0; length -= 1) {
    const found = contexts.get(scopeKey(event.params.namespace.slice(0, length)));
    if (found !== undefined) return found;
  }
  return {};
}

function scopeKey(namespace: readonly string[]): string { return namespace.join("\u0000"); }

/** Checks whether an event starts a model call.
 * @param event - Native event.
 * @returns Whether the event starts a model call.
 * @example isModelStart(event);
 */
export function isModelStart(event: ProtocolEvent): boolean {
  return event.method === "tasks" && isRecord(event.params.data) &&
    event.params.data.name === "model_request" && !("result" in event.params.data);
}

/** Checks whether an event starts a tool call.
 * @param event - Native event.
 * @returns Whether the event starts a tool call.
 * @example isToolStart(event);
 */
export function isToolStart(event: ProtocolEvent): boolean {
  return event.method === "tools" && isRecord(event.params.data) && event.params.data.event === "tool-started";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
