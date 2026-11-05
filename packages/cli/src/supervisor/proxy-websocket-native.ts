import { Effect } from "effect";
import type { ProxyDownstream } from "./proxy-websocket.types.js";

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

/** Avoids issuing a second native close while the runtime is already retiring a socket.
 * @param socket - Accepted downstream, if present. @param code - Propagated native close code.
 * @param reason - Propagated native reason. @returns Nothing when already closing. */
export function closeDownstream(
  socket: ProxyDownstream | undefined,
  code = 1012,
  reason = "Generation retired.",
): void {
  if (socket?.readyState === WebSocket.OPEN) socket.close(code, reason);
}

/** Closes an upstream client at once: Bun's `terminate`, or a normal close on Node.
 * @param upstream - Owned upstream client. @returns After requesting closure. */
export function terminateUpstream(upstream: WebSocket): void {
  const native = upstream as WebSocket & { readonly terminate?: () => void };
  if (typeof native.terminate === "function") native.terminate();
  else if (upstream.readyState === WebSocket.CONNECTING || upstream.readyState === WebSocket.OPEN)
    upstream.close();
}

/** Propagates a downstream close to the upstream client. Node's client rejects codes a client
 * may not send (such as 1005), so those close without a code.
 * @param upstream - Owned upstream client. @param code - Downstream close code.
 * @param reason - Downstream close reason. @returns After requesting closure. */
export function closeUpstream(upstream: WebSocket, code?: number, reason?: string): void {
  try {
    upstream.close(code, reason);
  } catch {
    upstream.close();
  }
}

/** Normalizes an upstream frame for the downstream socket and the pending-frame buffer.
 * @param data - Frame as delivered (`ArrayBuffer` on Node). @returns Text or bytes. */
export function frameBytes(data: string | ArrayBuffer | Uint8Array): string | Uint8Array {
  return data instanceof ArrayBuffer ? new Uint8Array(data) : data;
}

/** Opens the upstream client; Node delivers binary frames as `ArrayBuffer` rather than `Blob`.
 * @param url - Upstream URL. @param init - Forwarded headers and protocols. @returns The client. */
export function openUpstream(
  url: URL,
  init: { readonly headers: Record<string, string>; readonly protocols: string[] | undefined },
): WebSocket {
  const socket = new WebSocket(url, { headers: init.headers, protocols: init.protocols });
  if (typeof process.versions.bun !== "string") socket.binaryType = "arraybuffer";
  return socket;
}
