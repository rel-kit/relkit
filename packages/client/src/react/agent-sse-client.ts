import { AGENT_CAPABILITY_HEADER, AGENT_CAPABILITY_VALUE } from "@relkit/contracts";
import { ORPCError } from "@orpc/client";
import type { ClientHeaders } from "../index.types.js";
import { agentSseObservations } from "./agent-sse-stream.js";
import type { AgentSseClientOptions, AgentSseObserveInput } from "./agent-sse.types.js";

/**
 * Creates the native SSE edge used by the agent observation service.
 * @param options - Borrowed browser HTTP configuration.
 * @param fallback - Existing finite procedure proxy.
 * @returns A proxy overriding only the canonical observation procedure.
 */
export function createAgentSseClient(options: AgentSseClientOptions, fallback?: object): unknown {
  const observe = async (input: unknown, call?: unknown) => {
    const request = requireObserveInput(input);
    const signal = isRecord(call) && call.signal instanceof AbortSignal ? call.signal : undefined;
    const controller = new AbortController();
    const requestSignal =
      signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]);
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
        signal: requestSignal,
        body: JSON.stringify({
          threadId: request.threadId,
          ...(request.runId === undefined ? {} : { runId: request.runId }),
        }),
      },
    );
    if (!response.ok || response.body === null) {
      throw await responseError(response);
    }
    return agentSseObservations(response.body, controller, signal);
  };
  return new Proxy(fallback ?? {}, {
    get(target, property, receiver) {
      return property === "relkit.agent.observe"
        ? observe
        : Reflect.get(target, property, receiver);
    },
  });
}

/**
 * Translates the existing SSE HTTP error envelope into its canonical oRPC error.
 * @param response - Original native HTTP response.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
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

/**
 * Checks the existing selective SSE request authority before native dispatch.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The selectively checked observation request.
 */
function requireObserveInput(value: unknown): AgentSseObserveInput {
  if (
    !isRecord(value) ||
    typeof value.agentId !== "string" ||
    typeof value.threadId !== "string" ||
    (value.runId !== undefined && typeof value.runId !== "string") ||
    !isRecord(value.after)
  ) {
    throw new TypeError("Agent SSE observation input is invalid.");
  }
  return value as unknown as AgentSseObserveInput;
}

/**
 * Resolves current header values without mutating caller-owned headers.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
async function resolveHeaders(value: ClientHeaders | undefined): Promise<Headers> {
  const resolved = typeof value === "function" ? await value() : value;
  return new Headers(resolved as ConstructorParameters<typeof Headers>[0]);
}

/**
 * Checks whether the existing property-access boundary accepts a supplied value.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Whether property access is valid for this boundary.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object";
}
