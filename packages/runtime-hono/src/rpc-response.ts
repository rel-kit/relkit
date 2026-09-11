import { ORPCError } from "@orpc/server";
import { normalizeFailure, toPublicEnvelope } from "@relkit/runtime-effect";

export function rpcNotFound(): Response {
  return Response.json(
    {
      json: {
        defined: false,
        inferable: false,
        code: "NOT_FOUND",
        message: "Not Found",
      },
    },
    { status: 404 },
  );
}

export function rpcError(
  cause: unknown,
  signal: AbortSignal | undefined,
): ORPCError<string, unknown> {
  if (cause instanceof ORPCError) return cause;
  const failure = normalizeFailure(cause, signal === undefined ? {} : { signal });
  if (failure.kind === "application") {
    const envelope = toPublicEnvelope(failure);
    return envelope.data === undefined
      ? new ORPCError(failure.id, { message: failure.message })
      : new ORPCError(failure.id, { message: failure.message, data: envelope.data });
  }
  const code =
    failure.kind === "provider"
      ? "BAD_GATEWAY"
      : failure.kind === "timeout"
        ? "GATEWAY_TIMEOUT"
        : failure.kind === "cancellation"
          ? "CLIENT_CLOSED_REQUEST"
          : "INTERNAL_SERVER_ERROR";
  return new ORPCError(code);
}

export async function responseError(response: Response): Promise<ORPCError<string, unknown>> {
  const code =
    response.status === 401
      ? "UNAUTHORIZED"
      : response.status === 429
        ? "TOO_MANY_REQUESTS"
        : "INTERNAL_SERVER_ERROR";
  return new ORPCError(code, {
    data: await response
      .clone()
      .json()
      .catch(() => undefined),
  });
}
