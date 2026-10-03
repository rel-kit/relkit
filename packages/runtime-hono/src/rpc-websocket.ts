import { RPCHandler, type WebSocketLike } from "@orpc/server/websocket";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { createRpcRouter, type RpcContext } from "./rpc.js";
import { assertWebSocketRequest } from "./transport-security.js";

/** Installs the oRPC WebSocket adapter on the same router and policies as HTTP RPC.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param options - Application dependencies and configuration for this domain.
 * @param upgradeWebSocket - Bun adapter callback that upgrades an admitted native request.
 * @returns Nothing; the requested update is applied to the owned state.
 */
export function installRpcWebSocket(
  app: Hono,
  options: RouteMaterializationOptions,
  upgradeWebSocket: UpgradeWebSocket,
): void {
  const handler = new RPCHandler<RpcContext>(createRpcRouter(options).router);
  app.get(
    "/rpc",
    upgradeWebSocket(async (hono) => {
      if (options.transportSecurity !== undefined) {
        await assertWebSocketRequest(hono.req.raw, options.transportSecurity);
      }
      const context: RpcContext = {
        hono,
        auth: options.auth?.contextFor(hono.req.raw),
      };
      return {
        /** Forwards one admitted WebSocket message to the protocol handler.
         * @param event - Event or record being projected into the target protocol.
         * @param socket - Native WebSocket connection whose protocol state is owned by the handler.
         * @returns Nothing; the frame is dispatched or the connection is closed for an oversized message.
         */
        onMessage(event, socket) {
          if (encodedBytes(event.data) > REALTIME_RUNTIME_LIMITS.transportFrameBytes) {
            socket.close(1009, "Relkit frame exceeds the transport limit.");
            return;
          }
          const peer = (socket.raw ?? socket) as WebSocketLike;
          void handler
            .message(peer, event.data as string | ArrayBuffer, {
              context: (request) => ({ ...context, rpcHeaders: request.headers }),
            })
            .catch(() => {
              socket.close(1011, "Relkit RPC transport failed.");
            });
        },
        /** Releases protocol state when the WebSocket closes.
         * @param _event - Unused native close event; cleanup is keyed by its socket.
         * @param socket - Native WebSocket connection whose protocol state is owned by the handler.
         * @returns Nothing; protocol cleanup is requested for the closed socket.
         */
        onClose(_event, socket) {
          void handler.close((socket.raw ?? socket) as WebSocketLike);
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
