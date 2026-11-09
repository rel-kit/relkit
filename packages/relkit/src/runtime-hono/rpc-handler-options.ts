/** oRPC 1.x handler options shared by the HTTP and WebSocket RPC endpoints. */
import { ORPCError } from "@orpc/server";
import type { RPCHandlerOptions } from "@orpc/server/websocket";
import type { RpcContext } from "./rpc.types.js";

/** A root interceptor of the RPC handlers. */
type RootInterceptor = NonNullable<RPCHandlerOptions<RpcContext>["rootInterceptors"]>[number];

/**
 * Gives each thrown error the HTTP status its code is declared with. oRPC 1.x takes an
 * error's status from the error itself, so codes such as `orders.not-found` or the agent
 * and job codes would otherwise answer 500.
 * @param statuses - Status by error code.
 * @returns A procedure client interceptor.
 * @example new RPCHandler(router, { clientInterceptors: [errorStatusInterceptor({ "orders.not-found": 404 })] });
 */
export function errorStatusInterceptor(
  statuses: Readonly<Record<string, number>>,
): (options: { readonly next: () => Promise<unknown> }) => Promise<unknown> {
  return async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      throw withStatus(error, statuses);
    }
  };
}

/**
 * Copies a request's headers into the RPC context as `rpcHeaders`, where identity checks
 * read them for calls that arrive over a WebSocket.
 * @returns A root interceptor.
 * @example new RPCHandler(router, { rootInterceptors: [rpcHeadersInterceptor()] });
 */
export function rpcHeadersInterceptor(): RootInterceptor {
  return ({ next, ...options }) =>
    next({ ...options, context: { ...options.context, rpcHeaders: options.request.headers } });
}

/**
 * Re-creates an ORPCError with its mapped status.
 * @param error - The thrown value.
 * @param statuses - Status by error code.
 * @returns The same value, or an equal error with the mapped status.
 */
function withStatus(error: unknown, statuses: Readonly<Record<string, number>>): unknown {
  if (!(error instanceof ORPCError)) return error;
  const status = statuses[error.code];
  if (status === undefined || status === error.status) return error;
  return new ORPCError(error.code, {
    status,
    message: error.message,
    data: error.data,
    defined: error.defined,
    cause: error,
  });
}
