import { Context, Effect, Fiber, Layer, type Scope } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { nativeCall } from "./native-stream.js";
import type { ClientTransportService, TransportLink } from "./transport.types.js";
import type { CreateAutoClientOptions } from "./index.types.js";
import { httpLink, webSocketEndpoint, webSocketLink } from "./transport-native.js";
import { connectSocket, connectSocketEffect } from "./transport-socket.js";

/** Configured transport selection and invocation authority, without server dependencies. */
export class ClientTransport extends Context.Service<ClientTransport, ClientTransportService>()(
  "relkit/client/ClientTransport",
) {}

/**
 * Acquires one link owner with a lazy, shared transport-selection decision.
 * @param select - Native link or lazy auto-selection operation supplied by configuration.
 * @returns A synchronously acquirable Layer; lazy selection belongs to its owner Scope.
 * @remarks Each invocation can interrupt its own wait without cancelling or
 * poisoning the shared selection. Owner closure interrupts unfinished selection.
 * @example
 * ```ts
 * import { Effect, ManagedRuntime } from "effect";
 * import { runExecutionSync } from "@relkit/contracts/operation";
 * import { ClientTransport, clientTransportLayer } from "./transport.service.js";
 * export async function transportOwner(): Promise<void> {
 *   const owner = ManagedRuntime.make(clientTransportLayer(Effect.succeed({ call: async () => 1 })));
 *   try { const transport = runExecutionSync(owner, ClientTransport); }
 *   finally { await owner.dispose(); }
 * }
 * ```
 * @see packages/client/tests/transport/examples.test.ts for executable ownership examples.
 */
export function clientTransportLayer(
  select: Effect.Effect<TransportLink, unknown, Scope.Scope>,
): Layer.Layer<ClientTransport> {
  return Layer.effect(
    ClientTransport,
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const context = yield* Effect.context<Scope.Scope>();
      let selection: Fiber.Fiber<TransportLink, unknown> | undefined;
      const selected = Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          // Forking and publishing the handle cannot suspend; concurrent callers
          // share one owner-scoped selector before their interruptible joins.
          selection ??= yield* Effect.forkIn(Effect.provideContext(select, context), scope);
          return yield* restore(Fiber.join(selection));
        }),
      );
      return ClientTransport.of({
        invoke: Effect.fn("ClientTransport.invoke")((path, input, options) =>
          observeExecution(
            "client",
            "rpc.invoke",
            Effect.gen(function* () {
              const link = yield* selected;
              return yield* nativeCall((signal) =>
                link.call(path, input, {
                  ...options,
                  signal:
                    options.signal === undefined
                      ? signal
                      : AbortSignal.any([options.signal, signal]),
                }),
              );
            }),
          ),
        ),
      });
    }),
  );
}

/**
 * Selects WebSocket once, falling back only when initial establishment fails.
 * @param options - Explicit transport configuration, retaining existing option precedence.
 * @returns A lazy decision shared by the owning transport Layer.
 */
export const selectAutoTransport = Effect.fn("ClientTransport.select")(
  (options: CreateAutoClientOptions) =>
    Effect.gen(function* () {
      const fallback = httpLink(options);
      const Socket = options.websocket ?? globalThis.WebSocket;
      if (Socket === undefined) return fallback;
      const endpoint = webSocketEndpoint(options.baseUrl);
      let transferred = false;
      return yield* Effect.acquireRelease(
        connectSocketEffect(Socket, endpoint, options.establishmentTimeoutMs ?? 10_000),
        (socket) =>
          Effect.sync(() => {
            if (!transferred) socket.close();
          }),
        { interruptible: true },
      ).pipe(
        Effect.map((socket) => {
          let first: WebSocket | undefined = socket;
          return webSocketLink(options, Socket, () => {
            if (first === undefined)
              return connectSocket(Socket, endpoint, options.establishmentTimeoutMs ?? 10_000);
            const connected = first;
            first = undefined;
            transferred = true;
            return Promise.resolve(connected);
          });
        }),
        Effect.catch(() => Effect.succeed(fallback)),
      );
    }),
);
