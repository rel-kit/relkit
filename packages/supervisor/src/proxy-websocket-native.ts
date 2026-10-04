import { Effect } from "effect";
import type { ProxySocketData } from "./proxy-websocket.types.js";

/** Awaits native acceptance and unregisters handshake listeners on interruption.
 * @param upstream - Owned native client. @returns Acceptance or native rejection; interruption removes listeners. */
export function awaitUpstream(upstream: WebSocket): Effect.Effect<void, Error> {
  return Effect.callback<void, Error>((resume) => {
    if (upstream.readyState === WebSocket.OPEN) {
      resume(Effect.void);
      return;
    }
    if (upstream.readyState !== WebSocket.CONNECTING) {
      resume(Effect.fail(new Error("Upstream rejected upgrade.")));
      return;
    }
    /** Completes native handshake acceptance. @returns After resuming the awaiting fiber. */
    const opened = (): void => resume(Effect.void);
    /** Rejects native handshake acquisition. @returns After resuming the awaiting fiber. */
    const failed = (): void => resume(Effect.fail(new Error("Upstream rejected upgrade.")));
    upstream.addEventListener("open", opened, { once: true });
    upstream.addEventListener("error", failed, { once: true });
    upstream.addEventListener("close", failed, { once: true });
    return Effect.sync(() => {
      upstream.removeEventListener("open", opened);
      upstream.removeEventListener("error", failed);
      upstream.removeEventListener("close", failed);
    });
  });
}

/** Selectively forwards established authentication/origin headers. @param headers - Native client headers.
 * @returns Supported upstream handshake fields. */
export function websocketHeaders(headers: Headers): Record<string, string> {
  const allowed = ["authorization", "cookie", "origin", "user-agent", "x-forwarded-for"];
  return Object.fromEntries(
    allowed.flatMap((name) => {
      const value = headers.get(name);
      return value === null ? [] : [[name, value]];
    }),
  );
}

/** Parses native protocol negotiation. @param header - Client protocol header.
 * @returns Trimmed protocol names or undefined. */
export function protocols(header: string | null): string[] | undefined {
  const values = header
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values?.length ? values : undefined;
}

/** Avoids issuing a second native close while Bun is already retiring a socket.
 * @param socket - Accepted downstream, if present. @param code - Propagated native close code.
 * @param reason - Propagated native reason. @returns Nothing when already closing. */
export function closeDownstream(
  socket: Bun.ServerWebSocket<ProxySocketData> | undefined,
  code = 1012,
  reason = "Generation retired.",
): void {
  if (socket?.readyState === WebSocket.OPEN) socket.close(code, reason);
}
