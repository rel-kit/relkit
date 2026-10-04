import { Context, Effect, Layer, Stream } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { nativeStream } from "../native-stream.js";
import { procedureCall } from "./procedure.js";
import type { ClientStreamService } from "./stream.service.types.js";

/** Arbitrary declared procedure observation lifetime, independent of React. */
export class ClientStreams extends Context.Service<ClientStreams, ClientStreamService>()(
  "@relkit/client/ClientStreams",
) {}

/**
 * Supplies declared procedure streams with scoped native pulls.
 * @returns A resource-free Layer; each consume Effect owns its native Scope and pull fiber.
 * @see tests/transport/native.test.ts for checked pending-pull cancellation at the Bun boundary.
 */
export const ClientStreamsLive = Layer.succeed(
  ClientStreams,
  ClientStreams.of({
    /** Observes one declared procedure until completion or view interruption.
     * @param client - Borrowed generated procedure transport.
     * @param name - Exact declared procedure key.
     * @param input - Original request input.
     * @param signal - View lifetime propagated to the native request.
     * @param opened - Synchronous establishment callback.
     * @param publish - Isolated synchronous external-store publication callback.
     * @returns A lazy observed workflow whose interruption aborts and returns the native pull. */
    consume: Effect.fn("ClientStreams.consume")((client, name, input, signal, opened, publish) => {
      const source = nativeStream(
        "rpc.stream.frames",
        async (owned) => {
          const iterable = (await procedureCall(client, name)(input, {
            signal: owned,
          })) as AsyncIterable<unknown>;
          return iterable[Symbol.asyncIterator]();
        },
        signal,
        Effect.sync(opened),
      );
      return observeExecution(
        "client",
        "rpc.stream",
        Stream.runForEach(source, (item) =>
          Effect.sync(() => {
            if (!signal.aborted) publish(item);
          }),
        ),
      );
    }),
  }),
);
