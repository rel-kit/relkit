import { AGENT_CAPABILITY_HEADER } from "@relkit/contracts";
import { Context, Effect, Layer } from "effect";
import type { Hono } from "hono";
import { httpBoundary, HttpBoundaryError, observeHttp, runHttp } from "./http-effect.js";
import { TransportSecurityError } from "./transport-security-errors.js";
import type { TransportSecurityOptions } from "./transport-security.types.js";
export { TransportSecurityError } from "./transport-security-errors.js";
export type { TransportSecurityOptions } from "./transport-security.types.js";

/** Installs origin, preflight and CSRF policy before application routes.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing; registers preflight, origin and CSRF middleware on the application.
 */
export function installTransportSecurity(
  app: Hono,
  options: TransportSecurityOptions | undefined,
): void {
  if (options === undefined) return;
  const origins = allowedOrigins(options.allowedOrigins);
  app.use("*", async (context, next) => {
    const request = context.req.raw;
    const origin = request.headers.get("origin");
    if (request.method === "OPTIONS" && origin !== null) {
      if (origin !== new URL(request.url).origin && !origins.has(origin)) {
        return denied(context, "ORIGIN_DENIED");
      }
      const method = request.headers.get("access-control-request-method") ?? "";
      const methods = allowedMethods(options.allowedMethods);
      const requestedHeaders = request.headers.get("access-control-request-headers");
      if (
        !methods.has(method.toUpperCase()) ||
        !headersAllowed(requestedHeaders, options.allowedHeaders)
      ) {
        return denied(context, "ORIGIN_DENIED");
      }
      cors(context, origin, methods, requestedHeaders);
      return context.body(null, 204);
    }
    if (isStateChanging(request.method) && !context.req.path.startsWith("/rpc")) {
      try {
        await assertStateChangingRequest(request, options);
      } catch (error) {
        return denied(
          context,
          error instanceof TransportSecurityError ? error.code : "CSRF_DENIED",
        );
      }
    }
    await next();
    if (origin !== null && origins.has(origin)) cors(context, origin);
  });
}

/** Admit trusted service calls or enforce origin and CSRF policy for a mutation.
 * @param request - Mutation request containing origin and optional CSRF headers.
 * @param options - Trusted-service callback, admitted origins and token validator.
 * @returns An effect succeeding for admitted requests or failing with the public security error.
 */
const stateChangingRequest = Effect.fn("RequestSecurity.stateChanging")(function* (
  request: Request,
  options: TransportSecurityOptions,
) {
  if (
    yield* httpBoundary("security.trusted", () =>
      Promise.resolve(options.trustedService?.(request)),
    )
  )
    return;
  const origin = request.headers.get("origin") ?? refererOrigin(request.headers.get("referer"));
  if (origin === new URL(request.url).origin) return;
  if (origin === null || !allowedOrigins(options.allowedOrigins).has(origin)) {
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "security.origin",
        cause: new TransportSecurityError("ORIGIN_DENIED", "Request origin is not allowed."),
      }),
    );
  }
  const token = request.headers.get(options.csrfHeader ?? "x-relkit-csrf");
  if (
    token === null ||
    !(yield* httpBoundary("security.csrf", () =>
      Promise.resolve(options.validateCsrf?.(request, token)),
    ))
  ) {
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "security.csrf",
        cause: new TransportSecurityError("CSRF_DENIED", "CSRF validation failed."),
      }),
    );
  }
});

/** Validates origin and CSRF policy without replacing the public error class. */
export class RequestSecurity extends Context.Service<
  RequestSecurity,
  { readonly stateChanging: typeof stateChangingRequest }
>()("@relkit/runtime-hono/RequestSecurity") {}

/** Live trusted-service, origin and CSRF checks. */
export const RequestSecurityLive = Layer.succeed(RequestSecurity, {
  stateChanging: (...args) => observeHttp("security.stateChanging", stateChangingRequest(...args)),
});

/** Executes state-changing request policy at the native middleware edge.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A Promise succeeding for admitted requests or rejecting with the public security error.
 */
export function assertStateChangingRequest(
  request: Request,
  options: TransportSecurityOptions,
): Promise<void> {
  return runHttp(
    Effect.flatMap(RequestSecurity, (security) => security.stateChanging(request, options)).pipe(
      Effect.provide(RequestSecurityLive),
    ),
  );
}

/** Rejects a WebSocket origin outside the configured credentialed origin policy.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing for an admitted origin; otherwise throws TransportSecurityError.
 */
export function assertWebSocketOrigin(request: Request, options: TransportSecurityOptions): void {
  const origin = request.headers.get("origin");
  if (
    origin === null ||
    origin === "null" ||
    (origin !== new URL(request.url).origin && !allowedOrigins(options.allowedOrigins).has(origin))
  ) {
    throw new TransportSecurityError("ORIGIN_DENIED", "WebSocket origin is not allowed.");
  }
}

/** Allows trusted service callers or validates the WebSocket origin.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A Promise succeeding for trusted callers or admitted WebSocket origins.
 */
export async function assertWebSocketRequest(
  request: Request,
  options: TransportSecurityOptions,
): Promise<void> {
  if (await options.trustedService?.(request)) return;
  assertWebSocketOrigin(request, options);
}

/** Writes credentialed CORS response headers for an admitted origin.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param origin - Origin admitted by the current transport-security check.
 * @param methods - Normalized methods advertised by the preflight response.
 * @param headers - Native or protocol headers available to this request.
 * @returns Nothing; appends credentialed CORS and optional preflight headers.
 */
function cors(
  context: { header(name: string, value: string, options?: { append?: boolean }): void },
  origin: string,
  methods?: ReadonlySet<string>,
  headers?: string | null,
): void {
  context.header("Access-Control-Allow-Origin", origin);
  context.header("Access-Control-Allow-Credentials", "true");
  context.header("Vary", "Origin", { append: true });
  if (methods !== undefined)
    context.header("Access-Control-Allow-Methods", [...methods].join(", "));
  if (headers) context.header("Access-Control-Allow-Headers", headers);
}

const DEFAULT_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;
const DEFAULT_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "last-event-id",
  "x-relkit-csrf",
  "x-relkit-identity-scope",
  "x-relkit-operation-id",
  "x-relkit-public-fingerprint",
  "x-relkit-session-epoch",
  "x-relkit-agent-observe",
  AGENT_CAPABILITY_HEADER,
] as const;

/** Builds the normalized set of methods admitted by preflight policy.
 * @param values - Configured values normalized into the resulting lookup set.
 * @returns Uppercase allowed methods, using the default method set when unspecified.
 */
export function allowedMethods(values: readonly string[] | undefined): ReadonlySet<string> {
  return new Set((values ?? DEFAULT_METHODS).map((value) => value.toUpperCase()));
}

/** Checks that every requested preflight header is explicitly admitted.
 * @param value - Value inspected, validated or projected by this operation.
 * @param configured - Explicitly configured allowlist or timeout bound.
 * @returns Whether the value satisfies the required public contract.
 */
function headersAllowed(value: string | null, configured: readonly string[] | undefined): boolean {
  if (value === null || value.trim() === "") return true;
  const allowed = new Set((configured ?? DEFAULT_HEADERS).map((header) => header.toLowerCase()));
  return value.split(",").every((header) => allowed.has(header.trim().toLowerCase()));
}

/** Normalizes configured origins and rejects credentialed wildcard access.
 * @param values - Configured values normalized into the resulting lookup set.
 * @returns Normalized exact origins; invalid or wildcard origins throw a configuration error.
 */
export function allowedOrigins(values: readonly string[]): ReadonlySet<string> {
  if (values.includes("*")) throw new TypeError("Credentialed CORS cannot use a wildcard origin.");
  return new Set(values.map((value) => new URL(value).origin));
}

/** Extracts a valid referrer origin without throwing on malformed input.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The referrer's origin, or null when missing or malformed.
 */
function refererOrigin(value: string | null): string | null {
  if (value === null) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Identifies methods requiring origin and CSRF checks.
 * @param method - Normalized native HTTP request method.
 * @returns Whether the value satisfies the required public contract.
 */
function isStateChanging(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

/** Creates the safe transport-security rejection envelope.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param code - Stable public error identifier.
 * @returns The stable HTTP 403 security error response.
 */
function denied(context: { json(value: unknown, status: 403): Response }, code: string): Response {
  return context.json({ error: { id: code, message: "Request rejected." } }, 403);
}
