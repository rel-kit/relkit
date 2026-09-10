import type { ProtocolEvent } from "@langchain/langgraph";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { AgentExecutionEvent } from "./runtime-events.js";
import { validateValue } from "./runtime-utils.js";

export type NativeExecutionContext = Pick<AgentExecutionEvent, "agent" | "parent">;

export async function nativePublicEvent(
  event: ProtocolEvent,
  stateSchemas: ReadonlyMap<string, StandardSchemaV1>,
  context: NativeExecutionContext = {},
  eventSchemas: Readonly<Record<string, StandardSchemaV1>> = {},
): Promise<AgentExecutionEvent> {
  const value = await publicValue(event.method, event.params.data, stateSchemas, eventSchemas);
  return {
    nativeSequence: event.seq,
    kind: event.method,
    scope: [...event.params.namespace],
    occurredAt: new Date(event.params.timestamp).toISOString(),
    ...context,
    ...(event.params.node === undefined ? {} : { node: event.params.node }),
    ...(value === undefined ? {} : { value }),
  };
}

export function publicToolValue(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  if (isRecord(value) && value.lg_name === "Command") {
    const update = value.update;
    const messages = isRecord(update) && Array.isArray(update.messages) ? update.messages : [];
    return messages.length === 0 ? { completed: true } : publicToolValue(messages.at(-1));
  }
  if (!isRecord(value) || !("content" in value)) return value;
  return publicToolValue(value.content);
}

async function publicValue(
  method: string,
  value: unknown,
  stateSchemas: ReadonlyMap<string, StandardSchemaV1>,
  eventSchemas: Readonly<Record<string, StandardSchemaV1>>,
): Promise<unknown> {
  if (method === "input") return undefined;
  if (method === "values" || method === "updates") return selectedState(value, stateSchemas);
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
    return { name: value.name, data: await validateValue(schema, value.data, "output") };
  }
  return undefined;
}

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

async function selectedState(
  value: unknown,
  schemas: ReadonlyMap<string, StandardSchemaV1>,
): Promise<unknown> {
  if (!isRecord(value) || schemas.size === 0) return undefined;
  const direct = await select(value, schemas);
  if (Object.keys(direct).length > 0) return direct;
  const nested = Object.fromEntries(
    (
      await Promise.all(
        Object.entries(value).map(async ([name, update]) => {
          if (!isRecord(update)) return undefined;
          const selected = await select(update, schemas);
          return Object.keys(selected).length === 0 ? undefined : ([name, selected] as const);
        }),
      )
    ).filter((entry): entry is readonly [string, Record<string, unknown>] => entry !== undefined),
  );
  return Object.keys(nested).length === 0 ? undefined : nested;
}

async function select(
  value: Record<string, unknown>,
  schemas: ReadonlyMap<string, StandardSchemaV1>,
): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    [...schemas].map(async ([key, schema]) =>
      value[key] === undefined
        ? undefined
        : ([key, await validateValue(schema, value[key], "output")] as const),
    ),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== undefined));
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
