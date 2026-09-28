import type { ProtocolEvent } from "@langchain/langgraph";
import type { BrowserMessage } from "@relkit/contracts";
import type { AgentContentSink, AgentExecutionEvent } from "../src/index.ts";
import { collectNativeEvents } from "../src/runtime-native-events.ts";
import { toolStrategy } from "langchain";

export function relkitOutput() {
  return toolStrategy(
    {
      title: "relkit_output",
      type: "object",
      properties: {
        value: {
          type: "object",
          properties: { answer: { type: "string" } },
          required: ["answer"],
          additionalProperties: false,
        },
      },
      required: ["value"],
      additionalProperties: false,
    },
    { handleError: false },
  );
}

export function sink(
  events: AgentExecutionEvent[],
  tools: Array<{ toolId: string; state: string }> = [],
  messages: BrowserMessage[] = [],
): AgentContentSink {
  return {
    emitOutput: () => undefined,
    emitEvent: (event) => events.push(event),
    emitTool: ({ toolId, state }) => tools.push({ toolId, state }),
    emitMessage: (message) => messages.push(message),
  };
}

export async function limitFailure(
  method: "tasks" | "tools",
  name: string,
  limits: { maxSteps: number; maxToolCalls: number },
): Promise<void> {
  const data =
    method === "tasks"
      ? { id: "id", name }
      : { event: "tool-started", tool_call_id: "id", tool_name: name };
  await collectNativeEvents(
    stream([native(0, method, [], data), native(1, method, ["tools:child"], data)]),
    undefined,
    new Map(),
    new Set(),
    new AbortController().signal,
    limits,
    new Map(),
    () => undefined,
    undefined,
    () => undefined,
  );
}

export async function* stream(events: readonly ProtocolEvent[]): AsyncIterable<ProtocolEvent> {
  yield* events;
}

export function native(
  seq: number,
  method: string,
  namespace: string[],
  data: unknown,
): ProtocolEvent {
  return {
    type: "event",
    seq,
    method,
    params: { namespace, timestamp: seq, data },
  } as ProtocolEvent;
}
