/**
 * Establishes a socket within a deadline and hands the connected socket to the caller.
 * @param Socket - Browser constructor supplied by the transport owner.
 * @param endpoint - Resolved WebSocket endpoint.
 * @param timeoutMs - Establishment timeout in milliseconds.
 * @param signal - Optional cancellation; aborting closes the unopened socket.
 * @returns The connected socket. Failed, timed-out or cancelled sockets are closed; a
 * synchronous constructor exception rejects with its original identity.
 * @example const socket = await connectSocket(WebSocket, new URL("wss://example.test/_relkit/v1/rpc"), 10_000);
 */
export function connectSocket(
  Socket: typeof WebSocket,
  endpoint: URL,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    let socket: WebSocket;
    try {
      socket = new Socket(endpoint);
    } catch (cause) {
      reject(cause);
      return;
    }
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeEventListener("open", open);
      socket.removeEventListener("error", error);
      signal?.removeEventListener("abort", abort);
    };
    const fail = (cause: unknown): void => {
      cleanup();
      socket.close();
      reject(cause);
    };
    const open = (): void => {
      cleanup();
      resolve(socket);
    };
    const error = (): void => fail(new Error("RelKit WebSocket connection failed."));
    const abort = (): void => fail(signal?.reason);
    const timer = setTimeout(
      () => fail(new DOMException("WebSocket establishment timed out.", "TimeoutError")),
      timeoutMs,
    );
    socket.addEventListener("open", open, { once: true });
    socket.addEventListener("error", error, { once: true });
    signal?.addEventListener("abort", abort, { once: true });
  });
}
