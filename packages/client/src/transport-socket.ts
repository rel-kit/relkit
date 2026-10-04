import { Effect } from "effect";
import { runClient } from "./client-runtime.js";
import { observeExecution } from "@relkit/contracts/operation";

/**
 * Establishes a socket through an interruptible Clock deadline and native callback.
 * @param Socket - Browser constructor supplied by the transport owner.
 * @param endpoint - Resolved WebSocket endpoint.
 * @param timeoutMs - Existing establishment timeout.
 * @returns A connected socket transferred to oRPC; failed/unused sockets are closed.
 */
export function connectSocket(
  Socket: typeof WebSocket,
  endpoint: URL,
  timeoutMs: number,
): Promise<WebSocket> {
  return runClient(connectSocketEffect(Socket, endpoint, timeoutMs));
}

/**
 * Owns establishment callbacks until socket ownership transfers to oRPC.
 * @param Socket - Replaceable browser constructor.
 * @param endpoint - Resolved endpoint.
 * @param timeoutMs - Injected-clock establishment deadline.
 * @returns Lazy cancellable acquisition retaining existing public errors.
 */
export const connectSocketEffect = Effect.fn("ClientTransport.connect")(
  (Socket: typeof WebSocket, endpoint: URL, timeoutMs: number) =>
    observeExecution(
      "client",
      "rpc.connect",
      Effect.callback<WebSocket, unknown>((resume) => {
        const socket = new Socket(endpoint);
        let opened = false;
        const cleanup = (): void => {
          socket.removeEventListener("open", open);
          socket.removeEventListener("error", error);
        };
        const open = (): void => {
          opened = true;
          cleanup();
          resume(Effect.succeed(socket));
        };
        const error = (): void => {
          cleanup();
          socket.close();
          resume(Effect.fail(new Error("Relkit WebSocket connection failed.")));
        };
        socket.addEventListener("open", open, { once: true });
        socket.addEventListener("error", error, { once: true });
        return Effect.sync(() => {
          cleanup();
          if (!opened) socket.close();
        });
      }).pipe(
        Effect.timeoutOrElse({
          duration: timeoutMs,
          orElse: () =>
            Effect.fail(new DOMException("WebSocket establishment timed out.", "TimeoutError")),
        }),
      ),
    ),
);
