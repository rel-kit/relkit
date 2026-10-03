import { ORPCError } from "@orpc/server";
import { normalizeFailure, toPublicEnvelope } from "@relkit/runtime-effect";

/** Creates the existing safe oRPC not-found response.
 * @returns A JSON response with the public oRPC NOT_FOUND envelope and status 404.
 */
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

/** Converts a native invocation failure into the public oRPC error contract.
 * @param cause - Native failure projected without exposing private exception details.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns The original oRPC error or a sanitized error matching the normalized invocation failure.
 */
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

/** Reads the safe error metadata from a materialized HTTP failure response.
 * @param response - Native response whose status, headers and body lifetime are preserved.
 * @returns An oRPC error selected from the response status, with its parseable JSON body as data.
 */
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
