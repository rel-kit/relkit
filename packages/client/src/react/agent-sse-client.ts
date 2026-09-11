import {
  AGENT_CAPABILITY_HEADER,
  AGENT_CAPABILITY_VALUE,
  type AgentObservation,
  type JournalCheckpoint,
} from "@relkit/contracts";
import { ORPCError, type ClientHeaders } from "../index.js";

interface AgentSseClientOptions {
  readonly baseUrl: string;
  readonly credentials: NonNullable<RequestInit["credentials"]>;
  readonly headers?: ClientHeaders;
  readonly fetch: typeof globalThis.fetch;
}

interface ObserveInput {
  readonly agentId: string;
  readonly threadId: string;
  readonly runId?: string;
  readonly after: JournalCheckpoint;
}

export function createAgentSseClient(options: AgentSseClientOptions, fallback?: object): unknown {
  const observe = async (input: unknown, call?: unknown) => {
    const request = requireObserveInput(input);
    const signal = isRecord(call) && call.signal instanceof AbortSignal ? call.signal : undefined;
    const headers = await resolveHeaders(options.headers);
    headers.set("accept", "text/event-stream");
    headers.set("content-type", "application/json");
    headers.set("last-event-id", encodeURIComponent(JSON.stringify(request.after)));
    headers.set("x-relkit-agent-observe", "1");
    if (!headers.has(AGENT_CAPABILITY_HEADER)) {
      headers.set(AGENT_CAPABILITY_HEADER, AGENT_CAPABILITY_VALUE);
    }
    const response = await options.fetch(
      new URL(`/_relkit/v1/agents/${encodeURIComponent(request.agentId)}/ag-ui`, options.baseUrl),
      {
        method: "POST",
        headers,
        credentials: options.credentials,
        ...(signal === undefined ? {} : { signal }),
        body: JSON.stringify({
          threadId: request.threadId,
          ...(request.runId === undefined ? {} : { runId: request.runId }),
        }),
      },
    );
    if (!response.ok || response.body === null) {
      throw await responseError(response);
    }
    return observations(response.body, signal);
  };
  return new Proxy(fallback ?? {}, {
    get(target, property, receiver) {
      return property === "relkit.agent.observe"
        ? observe
        : Reflect.get(target, property, receiver);
    },
  });
}

async function responseError(response: Response): Promise<ORPCError<string, unknown>> {
  const payload = await response.json().catch(() => undefined);
  const nested = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;
  const code =
    nested !== undefined && typeof nested.id === "string"
      ? nested.id
      : response.status === 401
        ? "UNAUTHORIZED"
        : response.status === 403
          ? "FORBIDDEN"
          : response.status === 404
            ? "NOT_FOUND"
            : response.status === 409
              ? "IDENTITY_PRECONDITION_FAILED"
              : response.status === 422
                ? "BAD_REQUEST"
                : "INTERNAL_SERVER_ERROR";
  const message =
    nested !== undefined && typeof nested.message === "string"
      ? nested.message
      : `Relkit agent SSE request failed (${response.status})`;
  return new ORPCError(code, { message });
}

async function* observations(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<AgentObservation> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal?.aborted) {
      const next = await reader.read();
      buffer += decoder.decode(next.value, { stream: !next.done }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const observation = decodeObservation(block);
        if (observation !== undefined) yield observation;
        boundary = buffer.indexOf("\n\n");
      }
      if (next.done) return;
    }
  } finally {
    await reader.cancel(signal?.reason).catch(() => undefined);
    reader.releaseLock();
  }
}

function decodeObservation(block: string): AgentObservation | undefined {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (data === "") return undefined;
  const event = JSON.parse(data) as unknown;
  if (!isRecord(event) || !isRecord(event.metadata) || !isRecord(event.metadata.relkit)) {
    return undefined;
  }
  return event.metadata.relkit.observation as AgentObservation | undefined;
}

function requireObserveInput(value: unknown): ObserveInput {
  if (
    !isRecord(value) ||
    typeof value.agentId !== "string" ||
    typeof value.threadId !== "string" ||
    (value.runId !== undefined && typeof value.runId !== "string") ||
    !isRecord(value.after)
  ) {
    throw new TypeError("Agent SSE observation input is invalid.");
  }
  return value as unknown as ObserveInput;
}

async function resolveHeaders(value: ClientHeaders | undefined): Promise<Headers> {
  const resolved = typeof value === "function" ? await value() : value;
  return new Headers(resolved as ConstructorParameters<typeof Headers>[0]);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object";
}
