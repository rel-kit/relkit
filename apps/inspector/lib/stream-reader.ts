import { InspectorApiError, type InspectorFetch } from "./api-types";
import {
  STREAM_EVENT_TYPES,
  STREAM_PROTOCOL,
  STREAM_VERSION,
  type StreamEvent,
} from "./stream-protocol";

export interface StreamConnectionOptions {
  readonly fetcher: InspectorFetch;
  readonly url: string;
  readonly headers: Headers;
  readonly signal: AbortSignal | undefined;
  readonly active: () => boolean;
  readonly connected: () => void;
  readonly event: (event: StreamEvent, dropped: number) => void;
}

export async function connectStream(options: StreamConnectionOptions): Promise<void> {
  let response: Response;
  try {
    const init: RequestInit = { headers: options.headers };
    if (options.signal !== undefined) init.signal = options.signal;
    response = await options.fetcher(options.url, init);
  } catch {
    throw new InspectorApiError(
      "Inspector backend is disconnected",
      "ZSYS_INSPECTOR_DISCONNECTED",
      undefined,
      "network",
    );
  }
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string") code = body.error;
    } catch {}
    throw new InspectorApiError(
      code,
      code,
      response.status,
      code.includes("PROTOCOL") ? "protocol" : "http",
    );
  }
  const headerVersion = response.headers.get("x-zsys-api-version");
  if (headerVersion !== null && headerVersion !== String(STREAM_VERSION))
    throw protocolError("Inspector stream protocol is unsupported");
  if (!response.body)
    throw new InspectorApiError("Inspector stream has no body", "ZSYS_INSPECTOR_INVALID_RESPONSE");
  options.connected();
  await consumeStream(response.body, options.active, options.event);
}

async function consumeStream(
  body: ReadableStream<Uint8Array>,
  active: () => boolean,
  onEvent: (event: StreamEvent, dropped: number) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (active()) {
      const result = await reader.read();
      buffer += decoder.decode(result.value ?? new Uint8Array(), { stream: !result.done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const parsed = parseFrame(frame);
        if (parsed !== undefined) onEvent(parsed.event, parsed.dropped);
      }
      if (result.done) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function parseFrame(
  frame: string,
): { readonly event: StreamEvent; readonly dropped: number } | undefined {
  const lines = frame.split(/\r?\n/);
  const id = lines
    .find((line) => line.startsWith("id: "))
    ?.slice(4)
    .trim();
  const type = lines
    .find((line) => line.startsWith("event: "))
    ?.slice(7)
    .trim();
  const data = lines
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .join("\n");
  if (id === undefined || type === undefined || data === "") return undefined;
  if (
    !/^\d+$/.test(id) ||
    !Number.isSafeInteger(Number(id)) ||
    !STREAM_EVENT_TYPES.includes(type as (typeof STREAM_EVENT_TYPES)[number])
  )
    throw protocolError("Inspector stream event is invalid");
  let event: Partial<StreamEvent>;
  try {
    event = JSON.parse(data) as Partial<StreamEvent>;
  } catch {
    throw protocolError("Inspector stream event is invalid");
  }
  if (
    event.protocol !== STREAM_PROTOCOL ||
    event.version !== STREAM_VERSION ||
    event.cursor !== id ||
    event.type !== type
  )
    throw protocolError("Inspector stream protocol is unsupported");
  return { event: event as StreamEvent, dropped: droppedCount(event.data) };
}

function droppedCount(value: unknown): number {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return 0;
  const record = value as { dropped?: unknown; droppedEvents?: unknown };
  const count = record.droppedEvents ?? record.dropped;
  return typeof count === "number" && Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function protocolError(message: string): InspectorApiError {
  return new InspectorApiError(message, "ZSYS_INSPECTOR_PROTOCOL_MISMATCH", undefined, "protocol");
}
