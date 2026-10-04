import { createORPCClient } from "@orpc/client";
import type { RouterContract, RouterContractClient } from "@orpc/contract";
import { Effect, ManagedRuntime, type Scope } from "effect";
import { runExecutionPromise, runExecutionSync } from "@relkit/contracts/operation";
import type { DefaultContract } from "./index.js";
import type {
  CreateClientOptions,
  CreateWebSocketClientOptions,
  CreateAutoClientOptions,
} from "./index.types.js";
import type { TransportLink } from "./transport.types.js";
import { ClientTransport, clientTransportLayer, selectAutoTransport } from "./transport.service.js";
import { httpLink, webSocketLink } from "./transport-native.js";

/**
 * Creates the generated contract's synchronous HTTP proxy with a configured service owner.
 * @typeParam Contract - Original inferred/augmented application contract.
 * @param options - Explicit HTTP transport and authentication configuration.
 * @returns The existing Promise/AsyncIterable oRPC client shape.
 * @example
 * ```ts
 * import { createClient } from "@relkit/client";
 * export const makeClient = () => createClient({ baseUrl: "http://127.0.0.1:3000" });
 * ```
 * @category Client
 * @since 0.1.0
 */
export function createClient<Contract extends RouterContract = DefaultContract>(
  options: CreateClientOptions,
): RouterContractClient<Contract> {
  return proxy<Contract>(Effect.succeed(httpLink(options)));
}

/**
 * Creates a synchronous lazy WebSocket proxy, retaining constructor availability errors.
 * @typeParam Contract - Application contract inferred from the original registry.
 * @param options - WebSocket constructor, headers and establishment configuration.
 * @returns The existing oRPC proxy; oRPC owns connected sockets.
 */
export function createWebSocketClient<Contract extends RouterContract = DefaultContract>(
  options: CreateWebSocketClientOptions,
): RouterContractClient<Contract> {
  const Socket = options.websocket ?? globalThis.WebSocket;
  if (Socket === undefined) throw new Error("WebSocket is unavailable in this runtime.");
  return proxy<Contract>(Effect.succeed(webSocketLink(options, Socket)));
}

/**
 * Creates a lazy proxy whose first transport choice is shared by concurrent calls.
 * @typeParam Contract - Application contract inferred from the original registry.
 * @param options - Explicit HTTP/WebSocket configuration.
 * @returns The existing proxy with establishment-only HTTP fallback.
 */
export function createAutoClient<Contract extends RouterContract = DefaultContract>(
  options: CreateAutoClientOptions,
): RouterContractClient<Contract> {
  return proxy<Contract>(selectAutoTransport(options));
}

/**
 * Adapts one resource-free acquired service to oRPC's native link contract.
 * @typeParam Contract - Inferred public router shape.
 * @param select - Lazy configured link decision.
 * @returns A synchronous proxy; each call owns its own cancellable fiber.
 */
function proxy<Contract extends RouterContract>(
  select: Effect.Effect<TransportLink, unknown, Scope.Scope>,
): RouterContractClient<Contract> {
  const owner = ManagedRuntime.make(clientTransportLayer(select));
  const service = runExecutionSync(owner, ClientTransport);
  return createORPCClient({
    call: (path, input, options) =>
      runExecutionPromise(
        owner,
        service.invoke(path, input, options),
        options.signal === undefined ? undefined : { signal: options.signal },
      ),
  }) as RouterContractClient<Contract>;
}
