import { ORPCError } from "@orpc/server";
import type { JournalCheckpoint } from "@relkit/agents";
import { parseOperationId } from "@relkit/realtime";
import type { Context } from "hono";

export interface ServerSentEvent {
  readonly data: unknown;
  readonly id?: string;
}

export function eventStream(
  events: (signal: AbortSignal) => AsyncIterable<ServerSentEvent>,
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  const encoder = new TextEncoder();
  const aborter = new AbortController();
  let iterator: AsyncIterator<ServerSentEvent> | undefined;
  return new Response(
    new ReadableStream({
      async pull(streamController) {
        iterator ??= events(aborter.signal)[Symbol.asyncIterator]();
        try {
          const next = await iterator.next();
          if (next.done) streamController.close();
          else streamController.enqueue(encoder.encode(encodeEvent(next.value)));
        } catch (cause) {
          streamController.error(new Error("Agent protocol stream failed.", { cause }));
        }
      },
      async cancel(reason) {
        aborter.abort(reason);
        await iterator?.return?.(reason);
      },
    }),
    {
      headers: {
        "cache-control": "no-cache, no-transform",
        "content-type": "text/event-stream; charset=utf-8",
        ...extraHeaders,
      },
    },
  );
}

export function serverSentEvent(data: unknown, id?: string): ServerSentEvent {
  return { data, ...(id === undefined ? {} : { id }) };
}

export function encodeAgentCursor(checkpoint: JournalCheckpoint): string {
  return encodeURIComponent(JSON.stringify(checkpoint));
}

export function parseAgentCursor(value: string | undefined): JournalCheckpoint | undefined {
  if (value === undefined || value === "") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(value));
  } catch {
    throw new TypeError("Last-Event-ID is not a valid agent cursor.");
  }
  if (!isJournalCheckpoint(parsed)) {
    throw new TypeError("Last-Event-ID is not a valid agent cursor.");
  }
  return parsed;
}

function encodeEvent(event: ServerSentEvent): string {
  const id = event.id === undefined ? "" : `id: ${event.id}\n`;
  return `${id}data: ${JSON.stringify(event.data)}\n\n`;
}

function isJournalCheckpoint(value: unknown): value is JournalCheckpoint {
  if (!isRecord(value)) return false;
  return (
    ["applicationId", "environment", "profile", "providerEpoch", "threadId"].every(
      (name) => typeof value[name] === "string" && value[name] !== "",
    ) &&
    typeof value.sequence === "string" &&
    /^(0|[1-9]\d*)$/.test(value.sequence)
  );
}

export async function protocolEndpoint(context: Context, action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ORPCError) {
      const status =
        error.code === "AGENT_CAPABILITIES_UNSUPPORTED"
          ? 426
          : error.code === "IDENTITY_PRECONDITION_FAILED"
            ? 409
            : 403;
      return context.json({ error: { id: error.code, message: error.message } }, status);
    }
    if (error instanceof TypeError)
      return context.json({ error: { id: "INVALID_REQUEST", message: error.message } }, 422);
    return context.json({ error: { id: "AGENT_REQUEST_FAILED" } }, 500);
  }
}

export function operationId(context: Context) {
  const value = context.req.header("x-relkit-operation-id");
  if (value === undefined) throw new TypeError("x-relkit-operation-id is required.");
  return parseOperationId(value, { receiptWindowMs: 30 * 86_400_000 });
}

export function latestUserText(messages: readonly unknown[]): string | undefined {
  const message = last(
    messages,
    (item) => isRecord(item) && item.role === "user" && typeof item.content === "string",
  );
  return isRecord(message) && typeof message.content === "string" ? message.content : undefined;
}

export function messageText(message: { readonly parts: readonly unknown[] } | undefined) {
  const part = message?.parts.find((item) => isRecord(item) && item.kind === "text");
  return isRecord(part) && typeof part.text === "string" ? part.text : undefined;
}

export function last<Value>(values: readonly Value[], matches: (value: Value) => boolean) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]!;
    if (matches(value)) return value;
  }
  return undefined;
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object";
}
