import { RPCHandler, type MinimalWebsocket } from "@orpc/server/websocket";
import { FRAMEWORK_RPC_PATH, REALTIME_RUNTIME_LIMITS } from "../contracts/index.js";
import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { captureRequestContext } from "./http-logging.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { createRpcRouter, type RpcContext } from "./rpc.js";
import { errorStatusInterceptor, rpcHeadersInterceptor } from "./rpc-handler-options.js";
import { isRpcFrame } from "./rpc-websocket-frame.js";
import { contextProblem } from "./problem-details.js";
import { assertWebSocketRequest, TransportSecurityError } from "./transport-security.js";

/** Installs the oRPC WebSocket adapter on the same router and policies as HTTP RPC.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param options - Application dependencies and configuration for this domain.
 * @param upgradeWebSocket - Runtime adapter callback that upgrades an admitted native request.
 * @returns Nothing; the requested update is applied to the owned state.
 */
export function installRpcWebSocket(
  app: Hono,
  options: RouteMaterializationOptions,
  upgradeWebSocket: UpgradeWebSocket,
): void {
  const { router, errorStatusMap } = createRpcRouter(options);
  const handler = new RPCHandler<RpcContext>(router, {
    rootInterceptors: [rpcHeadersInterceptor()],
    clientInterceptors: [errorStatusInterceptor(errorStatusMap)],
  });
  app.get(
    FRAMEWORK_RPC_PATH,
    async (hono, next) => {
      const security = options.transportSecurity;
      if (security === undefined || hono.req.header("upgrade")?.toLowerCase() !== "websocket")
        return next();
      try {
        await assertWebSocketRequest(hono.req.raw, security);
      } catch (error) {
        if (!(error instanceof TransportSecurityError)) throw error;
        // The same answer as an HTTP request from a refused origin, before any upgrade.
        return contextProblem(hono, {
          status: 403,
          code: "origin-denied",
          detail: "The request was rejected.",
        });
      }
      return next();
    },
    upgradeWebSocket(async (hono) => {
      const context: RpcContext = {
        hono,
        auth: options.auth?.contextFor(hono.req.raw),
      };
      // Socket messages arrive outside the upgrade request's asynchronous context. Each one runs
      // in it again, so channel guards see the application (`getRelkit()`) as they do over HTTP.
      const inUpgradeContext = captureRequestContext();
      return {
        /** Forwards one admitted WebSocket message to the protocol handler.
         * @param event - Event or record being projected into the target protocol.
         * @param socket - Native WebSocket connection whose protocol state is owned by the handler.
         * @returns Nothing; the frame is dispatched or the connection is closed for an oversized message.
         */
        onMessage(event, socket) {
          if (encodedBytes(event.data) > REALTIME_RUNTIME_LIMITS.transportFrameBytes) {
            socket.close(1009, "RelKit frame exceeds the transport limit.");
            return;
          }
          if (!isRpcFrame(event.data)) {
            socket.close(1007, "RelKit RPC frame is not valid.");
            return;
          }
          const peer = (socket.raw ?? socket) as MinimalWebsocket;
          void inUpgradeContext(() =>
            handler.message(peer, event.data as string | ArrayBuffer, { context }),
          ).catch(() => {
            socket.close(1011, "RelKit RPC transport failed.");
          });
        },
        /** Releases protocol state when the WebSocket closes.
         * @param _event - Unused native close event; cleanup is keyed by its socket.
         * @param socket - Native WebSocket connection whose protocol state is owned by the handler.
         * @returns Nothing; protocol cleanup is requested for the closed socket.
         */
        onClose(_event, socket) {
          void handler.close((socket.raw ?? socket) as MinimalWebsocket);
        },
      };
    }),
  );
}

/** Measures the UTF-8 byte size used by transport or journal limits.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The encoded byte length, or infinity for an unsupported frame representation.
 */
function encodedBytes(value: unknown): number {
  if (typeof value === "string") return new TextEncoder().encode(value).byteLength;
  if (value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return Number.POSITIVE_INFINITY;
}
