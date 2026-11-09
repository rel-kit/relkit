import { abortable } from "./native/iterate.js";
import { createWorkOwner } from "./native/owner.js";
import type {
  ClientTransportService,
  TransportLink,
  TransportSelection,
} from "./transport.types.js";
import type { CreateAutoClientOptions } from "./index.types.js";
import { httpLink, webSocketEndpoint, webSocketLink } from "./transport-native.js";
import { connectSocket } from "./transport-socket.js";

/**
 * Creates one link owner with a lazy transport-selection decision shared by every call.
 * @param select - Native link or lazy auto-selection supplied by configuration.
 * @returns A transport whose calls share one selection and whose close aborts all owned work.
 * @remarks Each invocation can abort its own wait without cancelling or poisoning the
 * shared selection. Closing the owner aborts an unfinished selection and in-flight calls.
 * @example
 * ```ts
 * import { createClientTransport } from "./transport.service.js";
 * export async function transportOwner(): Promise<void> {
 *   const transport = createClientTransport(async () => ({ call: async () => 1 }));
 *   try { await transport.invoke([], undefined, { context: {} }); }
 *   finally { await transport.close(); }
 * }
 * ```
 * @see packages/client/tests/transport/examples.test.ts for executable ownership examples.
 */
export function createClientTransport(select: TransportSelection): ClientTransportService {
  const owner = createWorkOwner();
  let selection: Promise<TransportLink> | undefined;
  const selected = (): Promise<TransportLink> => (selection ??= owner.run(select));
  return {
    invoke: (path, input, options) =>
      owner.run(async (signal) => {
        const link = await abortable(selected(), signal);
        signal.throwIfAborted();
        return link.call(path, input, { ...options, signal });
      }, options.signal),
    close: () => owner.close(),
  };
}

/**
 * Selects WebSocket once, falling back to HTTP only when initial establishment fails.
 * @param options - Explicit transport configuration, retaining existing option precedence.
 * @returns A lazy selection; the first connected socket stays owned by the selection's
 * signal until the oRPC link takes it, so an unused socket closes with its owner.
 */
export function selectAutoTransport(options: CreateAutoClientOptions): TransportSelection {
  return async (signal) => {
    const fallback = httpLink(options);
    const Socket = options.websocket ?? globalThis.WebSocket;
    if (Socket === undefined) return fallback;
    const endpoint = webSocketEndpoint(options.baseUrl);
    const timeoutMs = options.establishmentTimeoutMs ?? 10_000;
    let socket: WebSocket;
    try {
      socket = await connectSocket(Socket, endpoint, timeoutMs, signal);
    } catch {
      // Owner closure is cancellation, not an establishment failure.
      if (signal.aborted) throw signal.reason;
      return fallback;
    }
    let first: WebSocket | undefined = socket;
    const release = (): void => {
      if (first === undefined) return;
      first = undefined;
      socket.close();
    };
    if (signal.aborted) release();
    else signal.addEventListener("abort", release, { once: true });
    return webSocketLink(options, Socket, () => {
      if (first === undefined) return connectSocket(Socket, endpoint, timeoutMs);
      const connected = first;
      first = undefined;
      signal.removeEventListener("abort", release);
      return Promise.resolve(connected);
    });
  };
}
