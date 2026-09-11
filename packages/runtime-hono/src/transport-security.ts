import { AGENT_CAPABILITY_HEADER, type MaybePromise } from "@relkit/contracts";
import type { Hono } from "hono";

export interface TransportSecurityOptions {
  readonly allowedOrigins: readonly string[];
  readonly allowedMethods?: readonly string[];
  readonly allowedHeaders?: readonly string[];
  readonly csrfHeader?: string;
  readonly validateCsrf?: (request: Request, token: string) => MaybePromise<boolean>;
  readonly trustedService?: (request: Request) => MaybePromise<boolean>;
}

export class TransportSecurityError extends Error {
  constructor(
    readonly code: "ORIGIN_DENIED" | "CSRF_DENIED",
    message: string,
  ) {
    super(message);
    this.name = "TransportSecurityError";
  }
}

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

export async function assertStateChangingRequest(
  request: Request,
  options: TransportSecurityOptions,
): Promise<void> {
  if (await options.trustedService?.(request)) return;
  const origin = request.headers.get("origin") ?? refererOrigin(request.headers.get("referer"));
  if (origin === new URL(request.url).origin) return;
  if (origin === null || !allowedOrigins(options.allowedOrigins).has(origin)) {
    throw new TransportSecurityError("ORIGIN_DENIED", "Request origin is not allowed.");
  }
  const token = request.headers.get(options.csrfHeader ?? "x-relkit-csrf");
  if (token === null || !(await options.validateCsrf?.(request, token))) {
    throw new TransportSecurityError("CSRF_DENIED", "CSRF validation failed.");
  }
}

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

export async function assertWebSocketRequest(
  request: Request,
  options: TransportSecurityOptions,
): Promise<void> {
  if (await options.trustedService?.(request)) return;
  assertWebSocketOrigin(request, options);
}

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

function allowedMethods(values: readonly string[] | undefined): ReadonlySet<string> {
  return new Set((values ?? DEFAULT_METHODS).map((value) => value.toUpperCase()));
}

function headersAllowed(value: string | null, configured: readonly string[] | undefined): boolean {
  if (value === null || value.trim() === "") return true;
  const allowed = new Set((configured ?? DEFAULT_HEADERS).map((header) => header.toLowerCase()));
  return value.split(",").every((header) => allowed.has(header.trim().toLowerCase()));
}

function allowedOrigins(values: readonly string[]): ReadonlySet<string> {
  if (values.includes("*")) throw new TypeError("Credentialed CORS cannot use a wildcard origin.");
  return new Set(values.map((value) => new URL(value).origin));
}

function refererOrigin(value: string | null): string | null {
  if (value === null) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isStateChanging(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

function denied(context: { json(value: unknown, status: 403): Response }, code: string): Response {
  return context.json({ error: { id: code, message: "Request rejected." } }, 403);
}
