import type { ProtocolEvent } from "@langchain/langgraph";
import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import type { AgentExecutionEvent } from "./runtime-events.js";
import { publicToolValue } from "./runtime-native-public-tools.js";
import { selectedStateEffect } from "./runtime-native-public-state.js";
import type { NativeExecutionContext } from "./runtime-native-public.types.js";
import { validateValueEffect } from "./runtime-utils.js";

export type { NativeExecutionContext } from "./runtime-native-public.types.js";
export { publicToolValue, publicToolValueEffect } from "./runtime-native-public-tools.js";

/** Projects a native protocol event to its public, validated form.
 * @param event - Native protocol event.
 * @param stateSchemas - Public state validators.
 * @param context - Agent and parent context.
 * @param eventSchemas - Custom event validators.
 * @returns An Effect with a public event or AgentInvocationFailure.
 * @example await Effect.runPromise(nativePublicEventEffect(event, schemas));
 */
export const nativePublicEventEffect = Effect.fn("Agents.runtime.nativePublicEvent")(
  function* (
    event: ProtocolEvent,
    stateSchemas: ReadonlyMap<string, StandardSchemaV1>,
    context: NativeExecutionContext = {},
    eventSchemas: Readonly<Record<string, StandardSchemaV1>> = {},
  ) {
    const value = yield* publicValueEffect(event.method, event.params.data, stateSchemas, eventSchemas);
    return yield* Effect.try({
      try: (): AgentExecutionEvent => ({
        nativeSequence: event.seq,
        kind: event.method,
        scope: [...event.params.namespace],
        occurredAt: new Date(event.params.timestamp).toISOString(),
        ...context,
        ...(event.params.node === undefined ? {} : { node: event.params.node }),
        ...(value === undefined ? {} : { value }),
      }),
      catch: agentInvocationFailure,
    });
  },
  (effect) => observeAgent("runtime.native-public-event", effect),
);

/** Projects a native event for existing Promise callers.
 * @param event - Native protocol event.
 * @param stateSchemas - Public state validators.
 * @param context - Agent and parent context.
 * @param eventSchemas - Custom event validators.
 * @returns A public event.
 * @throws The original schema or timestamp error.
 * @example await nativePublicEvent(event, schemas);
 */
export function nativePublicEvent(
  event: ProtocolEvent,
  stateSchemas: ReadonlyMap<string, StandardSchemaV1>,
  context: NativeExecutionContext = {},
  eventSchemas: Readonly<Record<string, StandardSchemaV1>> = {},
): Promise<AgentExecutionEvent> {
  return Effect.runPromise(nativePublicEventEffect(event, stateSchemas, context, eventSchemas).pipe(
    Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

const publicValueEffect = Effect.fn("Agents.runtime.publicEventValue")(
  function* (
  method: string,
  value: unknown,
  stateSchemas: ReadonlyMap<string, StandardSchemaV1>,
  eventSchemas: Readonly<Record<string, StandardSchemaV1>>,
  ) {
  if (method === "input") return undefined;
  if (method === "values" || method === "updates") return yield* selectedStateEffect(value, stateSchemas);
  if (method === "tasks") return publicTask(value);
  if (method === "checkpoints") {
    return eventFields(value, ["id", "parent_id", "step", "source"]);
  }
  if (method === "lifecycle") return publicLifecycle(value);
  if (method === "messages") return publicMessage(value);
  if (method === "tools" && isRecord(value)) {
    return {
      ...eventFields(value, ["event", "tool_call_id", "tool_name", "code"]),
      ...(value.input === undefined ? {} : { input: publicToolValue(value.input) }),
      ...(value.output === undefined ? {} : { output: publicToolValue(value.output) }),
    };
  }
  if (method === "custom" && isRecord(value) && typeof value.name === "string") {
    const schema = eventSchemas[value.name];
    if (schema === undefined) return undefined;
    return { name: value.name, data: yield* validateValueEffect(schema, value.data, "output") };
  }
  return undefined;
}, (effect) => observeAgent("runtime.public-event-value", effect));

function publicTask(value: unknown): unknown {
  if (!isRecord(value)) return {};
  const interrupted = Array.isArray(value.interrupts) && value.interrupts.length > 0;
  const status =
    value.error !== undefined
      ? "failed"
      : interrupted
        ? "interrupted"
        : "result" in value
          ? "completed"
          : "started";
  return { ...eventFields(value, ["id", "name"]), status };
}

function publicLifecycle(value: unknown): unknown {
  if (!isRecord(value)) return {};
  const cause = safeCause(value.cause);
  return {
    ...eventFields(value, ["event", "graph_name"]),
    ...(cause === undefined ? {} : { cause }),
  };
}

function safeCause(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "toolCall" && typeof value.tool_call_id === "string") {
    return { type: value.type, tool_call_id: value.tool_call_id };
  }
  if ((value.type === "send" || value.type === "edge") && typeof value.from_node === "string") {
    return { type: value.type, from_node: value.from_node };
  }
  return { type: "unknown" };
}

function publicMessage(value: unknown): unknown {
  if (!isRecord(value)) return {};
  const base = eventFields(value, ["event", "id", "run_id", "role", "index", "code"]);
  if (isRecord(value.delta) && value.delta.type === "reasoning-delta") return base;
  if (isRecord(value.content) && String(value.content.type).includes("reasoning")) return base;
  return {
    ...base,
    ...(publicContent(value.content) === undefined
      ? {}
      : { content: publicContent(value.content) }),
    ...(publicDelta(value.delta) === undefined ? {} : { delta: publicDelta(value.delta) }),
    ...(publicUsage(value.usage) === undefined ? {} : { usage: publicUsage(value.usage) }),
  };
}

function publicContent(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "reasoning" || value.type === "non_standard") return undefined;
  return eventFields(value, [
    "type",
    "id",
    "file_id",
    "url",
    "base64",
    "mime_type",
    "index",
    "text",
    "name",
    "args",
    "call_id",
  ]);
}

function publicDelta(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "reasoning-delta") return undefined;
  return eventFields(value, ["type", "text", "data", "encoding"]);
}

function publicUsage(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  return eventFields(value, ["input_tokens", "output_tokens", "total_tokens"]);
}

function eventFields(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    names.flatMap((name) => (value[name] === undefined ? [] : [[name, value[name]]])),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
