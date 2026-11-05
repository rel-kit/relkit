import { CLIENT_CONTRACT_EVENTS_PATH } from "../wire.js";

/** Callbacks of one contract event listener. */
export interface ContractEventHandlers {
  /** The backend may have a new contract: re-read the identity document. */
  readonly changed: () => void;
  /** Whether the development stream is connected. */
  readonly live: (connected: boolean) => void;
}

/**
 * Follows the backend's development contract stream until the signal aborts.
 *
 * `relkit dev` serves the stream on the backend's public port; elsewhere it answers 404 and
 * the listener stops. The stream sends `ready` when it connects and `contract` after each
 * generation switch; both report {@link ContractEventHandlers.changed}, because the contract
 * may also have changed while the stream was disconnected. A dropped stream reconnects with
 * a growing delay, up to ten seconds.
 * @param baseUrl - Backend root URL.
 * @param handlers - Change and connection callbacks.
 * @param signal - Ends the listener.
 * @returns A promise that settles when the listener ends.
 * @example void followContractEvents(baseUrl, { changed: reload, live: setLive }, signal);
 */
export async function followContractEvents(
  baseUrl: string,
  handlers: ContractEventHandlers,
  signal: AbortSignal,
): Promise<void> {
  let retryMs = 500;
  while (!signal.aborted) {
    try {
      const response = await fetch(new URL(CLIENT_CONTRACT_EVENTS_PATH, baseUrl), {
        cache: "no-store",
        credentials: "omit",
        headers: { accept: "text/event-stream" },
        signal,
      });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.startsWith("text/event-stream") || response.body === null) {
        await response.body?.cancel().catch(() => undefined);
        // Not served outside `relkit dev`: there is nothing to follow.
        if (response.status === 404 || response.status === 405) return;
      } else {
        handlers.live(true);
        retryMs = 500;
        await readEvents(response.body, (name) => {
          if (name === "ready" || name === "contract") handlers.changed();
        });
      }
    } catch {
      if (signal.aborted) return;
    }
    handlers.live(false);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, retryMs);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    retryMs = Math.min(retryMs * 2, 10_000);
  }
}

/**
 * Reads server-sent event names from a stream until it ends.
 * @param body - Event stream body.
 * @param event - Called with each event's name.
 * @returns A promise that settles when the stream ends.
 */
async function readEvents(
  body: ReadableStream<Uint8Array>,
  event: (name: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return;
      buffer += decoder.decode(next.value, { stream: true }).replaceAll("\r\n", "\n");
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const name = /^event: *(.+)$/m.exec(block)?.[1]?.trim();
        if (name !== undefined) event(name);
        end = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Whether the client runs in a development build, where contract events are followed.
 * @returns False when `NODE_ENV` is `production`.
 */
export function followsContractEvents(): boolean {
  return typeof process === "undefined" || process.env.NODE_ENV !== "production";
}
