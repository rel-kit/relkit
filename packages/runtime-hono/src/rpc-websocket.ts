import { RPCHandler, type WebSocketLike } from "@orpc/server/websocket";
import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { createRpcRouter, type RpcContext } from "./rpc.js";
import { assertWebSocketRequest } from "./transport-security.js";

/** Installs the oRPC WebSocket adapter on the same router and policies as HTTP RPC. */
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
        onMessage(event, socket) {
          if (encodedBytes(event.data) > REALTIME_RUNTIME_LIMITS.transportFrameBytes) {
            socket.close(1009, "Relkit frame exceeds the transport limit.");
            return;
          }
          const peer = (socket.raw ?? socket) as WebSocketLike;
          void handler.message(peer, event.data as string | ArrayBuffer, { context }).catch(() => {
            socket.close(1011, "Relkit RPC transport failed.");
          });
        },
        onClose(_event, socket) {
          void handler.close((socket.raw ?? socket) as WebSocketLike);
        },
      };
    }),
  );
}

function encodedBytes(value: unknown): number {
  if (typeof value === "string") return new TextEncoder().encode(value).byteLength;
  if (value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return Number.POSITIVE_INFINITY;
}
