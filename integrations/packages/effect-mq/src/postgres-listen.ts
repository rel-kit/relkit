import { PgClient } from "@effect/sql-pg";
import { Effect, Layer, Stream } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";

/** Adapt rc.115's scoped notification queue to EffectMQ 0.7's payload stream.
 * @param client - Native PostgreSQL client owning LISTEN acquisition and release.
 * @param channel - EffectMQ's declared wake-up channel.
 * @returns A lazy payload stream retaining SQL failures and the native listener scope.
 * @remarks Stream consumption owns LISTEN/UNLISTEN. Each SDK resubscription
 * acquires a fresh queue; no polling or retry policy is added here.
 * @see tests/postgres-listen.test.ts for scoped acquisition and SDK wake-up checks.
 * @internal
 */
export function effectMqListen(
  client: Pick<PgClient.PgClient, "listen">,
  channel: string,
): Stream.Stream<string, SqlError> {
  return Stream.unwrap(
    Effect.map(
      Effect.suspend(() => client.listen(channel)),
      (notifications) =>
        Stream.map(Stream.fromQueue(notifications), (notification) => notification.payload),
    ),
  );
}

/** Private SDK compatibility view; provide only to EffectMQ's Drizzle store.
 * EffectMQ 0.7 expects `listen` to return a Stream despite importing the current
 * PgClient type. All other methods and SQL function calls use the native client.
 * The original client is never changed or exposed through this legacy view.
 * @internal
 */
export const EffectMqPgCompatibility = Layer.effect(
  PgClient.PgClient,
  Effect.map(
    PgClient.PgClient,
    (client) =>
      new Proxy(client, {
        get(target, property, receiver) {
          return property === "listen"
            ? (channel: string) => effectMqListen(client, channel)
            : Reflect.get(target, property, receiver);
        },
      }),
  ),
);
