/** Exercises native authentication reentrancy through actual SQLite model and transaction work.
 * The test preserves database admission and verifies borrowed resources settle before release.
 */
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  activateDrizzleService,
  defineDrizzleService,
} from "../../../packages/drizzle/dist/index.js";
import {
  activateBetterAuthService,
  defineBetterAuthService,
} from "../../../packages/better-auth/src/drizzle.js";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

test("native auth initialization can activate another descriptor inside a SQLite transaction", async () => {
  const user = sqliteTable("user", { id: integer().primaryKey() });
  const sqlite = new Database(":memory:");
  const database = await activateDrizzleService(
    defineDrizzleService({
      schema: { user },
      client: () => drizzle({ client: sqlite }),
      dispose: () => sqlite.close(),
    }),
    {},
    { isolated: true },
  );
  const events: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const primary = reentrantAuthDescriptor(database, events);
    const auth = await Promise.race([
      database.context.transaction(() => activateBetterAuthService(primary, database, "/api/auth")),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Nested auth acquisition deadlocked")), 1000);
        timer.unref();
      }),
    ]);
    expect(events).toEqual(["primary init", "secondary ready"]);
    expect(await auth.api.getSession({ headers: new Headers() })).toBe(null);
    await database.close();
    await expect(auth.api.getSession({ headers: new Headers() })).rejects.toThrow(
      "Drizzle activation is closed",
    );
  } finally {
    clearTimeout(timer);
    await database.close();
  }
});

function reentrantAuthDescriptor(
  database: Parameters<typeof activateBetterAuthService>[1],
  events: string[],
) {
  const options = {
    baseURL: "http://localhost",
    secret: "reentrant-test-secret-at-least-32-bytes",
  };
  const secondary = defineBetterAuthService(options);
  return defineBetterAuthService({
    ...options,
    plugins: [
      {
        id: "nested-acquisition",
        init: async () => {
          events.push("primary init");
          const auth = await activateBetterAuthService(secondary, database, "/api/secondary");
          expect(await auth.api.getSession({ headers: new Headers() })).toBe(null);
          events.push("secondary ready");
        },
      },
    ],
  });
}
