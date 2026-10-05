import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  activateDrizzleService,
  defineDrizzleService,
} from "../../../packages/drizzle/dist/index.js";
import {
  activateBetterAuthService,
  defineBetterAuthService,
} from "../../../packages/better-auth/src/index.js";
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
  const options = {
    baseURL: "http://localhost",
    secret: "reentrant-test-secret-at-least-32-bytes",
  };
  const secondary = defineBetterAuthService(options);
  const primary = defineBetterAuthService({
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
  const auth = await Promise.race([
    database.context.transaction(() => activateBetterAuthService(primary, database, "/api/auth")),
    new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Nested auth acquisition deadlocked")), 1000);
      timer.unref();
    }),
  ]);
  expect(events).toEqual(["primary init", "secondary ready"]);
  expect(await auth.api.getSession({ headers: new Headers() })).toBe(null);
  await database.close();
  await expect(auth.api.getSession({ headers: new Headers() })).rejects.toThrow(
    "Drizzle activation is closed",
  );
});
