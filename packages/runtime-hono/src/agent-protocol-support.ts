import { ORPCError } from "@orpc/server";
import type { JournalCheckpoint } from "@relkit/agents";
import { parseOperationId } from "@relkit/realtime";
import type { Context } from "hono";
import type { ServerSentEvent } from "./agent-protocol-support.types.js";
export type { ServerSentEvent } from "./agent-protocol-support.types.js";

/** Expose a lazy async event source as a cancellable SSE response.
 * @param events - Lazy event producer receiving reader cancellation.
 * @param extraHeaders - Additional headers for the SSE response.
 * @returns An SSE response whose reader cancellation aborts and returns the source.
 */
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

/** Attach an optional replay ID to one SSE payload.
 * @param data - Public event or error payload.
 * @param id - Optional event or declaration identifier.
 * @returns The event data and optional ID.
 */
export function serverSentEvent(data: unknown, id?: string): ServerSentEvent {
  return { data, ...(id === undefined ? {} : { id }) };
}

/** Encode a journal checkpoint for Last-Event-ID transport.
 * @param checkpoint - Partitioned journal replay position.
 * @returns URI-encoded checkpoint JSON.
 * @example
 * const checkpoint = { applicationId: "app", environment: "test", profile: "local",
 *   providerEpoch: "epoch-1", threadId: "thread-1", sequence: "42" };
 * const replay = parseAgentCursor(encodeAgentCursor(checkpoint));
 * // replay?.sequence === "42"
 */
export function encodeAgentCursor(checkpoint: JournalCheckpoint): string {
  return encodeURIComponent(JSON.stringify(checkpoint));
}

/** Decode and validate a journal checkpoint from Last-Event-ID.
 * @param value - Value to validate or project.
 * @returns A valid checkpoint, or undefined for an absent or empty header.
 */
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

/** Serialize an event as one SSE data block with an optional ID.
 * @param event - Native event to translate.
 * @returns UTF-8-ready SSE text ending in a blank line.
 */
function encodeEvent(event: ServerSentEvent): string {
  const id = event.id === undefined ? "" : `id: ${event.id}\n`;
  return `${id}data: ${JSON.stringify(event.data)}\n\n`;
}

/** Check checkpoint partition identity and decimal sequence fields.
 * @param value - Value to validate or project.
 * @returns Whether the value has every required checkpoint field.
 */
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

/** Map protocol endpoint failures to stable public HTTP errors.
 * @param context - Current Hono or RPC request context.
 * @param action - Native operation or lazy stream producer.
 * @returns The successful response or a sanitized 4xx/5xx JSON response.
 */
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

/** Require and validate the agent operation ID within its receipt window.
 * @param context - Current Hono or RPC request context.
 * @returns The parsed operation ID accepted for the 30-day receipt window.
 */
export function operationId(context: Context) {
  const value = context.req.header("x-relkit-operation-id");
  if (value === undefined) throw new TypeError("x-relkit-operation-id is required.");
  return parseOperationId(value, { receiptWindowMs: 30 * 86_400_000 });
}

/** Find the last user message containing string content.
 * @param messages - Messages in chronological order.
 * @returns Its content, or undefined when no matching message exists.
 */
export function latestUserText(messages: readonly unknown[]): string | undefined {
  const message = last(
    messages,
    (item) => isRecord(item) && item.role === "user" && typeof item.content === "string",
  );
  return isRecord(message) && typeof message.content === "string" ? message.content : undefined;
}

/** Read the first text part from an optional browser message.
 * @param message - Public diagnostic message or browser message.
 * @returns The text string when the first text part contains one.
 */
export function messageText(message: { readonly parts: readonly unknown[] } | undefined) {
  const part = message?.parts.find((item) => isRecord(item) && item.kind === "text");
  return isRecord(part) && typeof part.text === "string" ? part.text : undefined;
}

/** Search backward for the last value matching a predicate.
 * @typeParam Value - Value produced by the source or selected by the predicate.
 * @param values - Values in their original order.
 * @param matches - Predicate selecting a matching value.
 * @returns The final matching value, or undefined.
 */
export function last<Value>(values: readonly Value[], matches: (value: Value) => boolean) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]!;
    if (matches(value)) return value;
  }
  return undefined;
}

/** Check whether a value is a non-null object suitable for field inspection.
 * @param value - Value to validate or project.
 * @returns Whether object fields can be inspected.
 */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object";
}
