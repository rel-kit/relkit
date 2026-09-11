import { InspectorApiError, type InspectorFetch } from "./api-types";
import { resolveBackendUrl } from "./backend-url";

export interface RouteInvocationInput {
  readonly path: string;
  readonly init: RequestInit;
}

export interface RouteInvocationResult {
  readonly status: number;
  readonly body: unknown;
  readonly requestId?: string;
  readonly traceId?: string;
}

export type RouteStreamFrame =
  | { readonly kind: "sse"; readonly event: string; readonly data: unknown }
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "bytes"; readonly byteLength: number };

export async function invokeActiveRoute(
  fetcher: InspectorFetch,
  baseUrl: string,
  inheritedHeaders: HeadersInit,
  input: RouteInvocationInput,
): Promise<RouteInvocationResult> {
  const headers = new Headers(inheritedHeaders);
  new Headers(input.init.headers).forEach((value, key) => headers.set(key, value));
  headers.set("accept", "application/json");
  let response: Response;
  try {
    response = await fetcher(resolveBackendUrl(baseUrl, input.path), { ...input.init, headers });
  } catch {
    throw new InspectorApiError(
      "Active backend is disconnected",
      "RELKIT_INSPECTOR_DISCONNECTED",
      undefined,
      "network",
    );
  }
  return {
    status: response.status,
    body: await readBody(response),
    ...headerValue(response, "x-request-id", "requestId"),
    ...headerValue(response, "x-trace-id", "traceId"),
  };
}

export async function invokeActiveRouteStream(
  fetcher: InspectorFetch,
  baseUrl: string,
  inheritedHeaders: HeadersInit,
  input: RouteInvocationInput,
  format: "sse" | "text" | "bytes",
  onFrame: (frame: RouteStreamFrame) => void,
  signal: AbortSignal,
): Promise<RouteInvocationResult> {
  const headers = new Headers(inheritedHeaders);
  new Headers(input.init.headers).forEach((value, key) => headers.set(key, value));
  headers.set("accept", accept(format));
  const response = await fetcher(resolveBackendUrl(baseUrl, input.path), {
    ...input.init,
    headers,
    signal,
  });
  if (!response.ok || response.body === null) {
    return {
      status: response.status,
      body: await readBody(response),
      ...headerValue(response, "x-request-id", "requestId"),
      ...headerValue(response, "x-trace-id", "traceId"),
    };
  }
  const terminal = await readStream(response.body, format, onFrame);
  return {
    status: response.status,
    body: { terminal },
    ...headerValue(response, "x-request-id", "requestId"),
    ...headerValue(response, "x-trace-id", "traceId"),
  };
}

async function readStream(
  body: ReadableStream<Uint8Array>,
  format: "sse" | "text" | "bytes",
  onFrame: (frame: RouteStreamFrame) => void,
): Promise<"complete" | "error" | "eof"> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal: "complete" | "error" | "eof" = "eof";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (format === "bytes") onFrame({ kind: "bytes", byteLength: value.byteLength });
    else if (format === "text")
      onFrame({ kind: "text", value: decoder.decode(value, { stream: true }) });
    else {
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const frame = sseFrame(block);
        if (frame === undefined) continue;
        onFrame(frame);
        if (frame.event === "relkit-complete") terminal = "complete";
        if (frame.event === "relkit-error") terminal = "error";
      }
    }
  }
  return terminal;
}

function sseFrame(block: string): RouteStreamFrame | undefined {
  const event = block
    .split("\n")
    .find((line) => line.startsWith("event:"))
    ?.slice(6)
    .trim();
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (event === undefined || data === "") return undefined;
  try {
    return { kind: "sse", event, data: JSON.parse(data) as unknown };
  } catch {
    return { kind: "sse", event, data };
  }
}

function accept(format: "sse" | "text" | "bytes"): string {
  return format === "sse"
    ? "text/event-stream"
    : format === "text"
      ? "text/plain"
      : "application/octet-stream";
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function headerValue(
  response: Response,
  header: string,
  key: "requestId" | "traceId",
): Record<string, string> {
  const value = response.headers.get(header);
  return value === null || value === "" ? {} : { [key]: value };
}
