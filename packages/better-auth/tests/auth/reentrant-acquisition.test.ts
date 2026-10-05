import { expect, it } from "@effect/vitest";
import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { Effect } from "effect";
import { activateBetterAuthService, defineBetterAuthService } from "../../src/index.js";

it.effect(
  "auth acquisition inherits a transaction lease without retaining it for later calls",
  () =>
    Effect.promise(async () => {
      const user = sqliteTable("user", { id: integer().primaryKey() });
      const database = await activateDrizzleService(
        defineDrizzleService({ schema: { user }, client: () => ({ run: () => undefined }) }),
        {},
        { isolated: true },
      );
      const descriptor = defineBetterAuthService({
        baseURL: "http://localhost",
        secret: "reentrant-test-secret-at-least-32-bytes",
      });
      const auth = await Promise.race([
        database.context.transaction(() =>
          activateBetterAuthService(descriptor, database, "/api/auth"),
        ),
        new Promise<never>((_resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Auth acquisition deadlocked")), 1000);
          timer.unref();
        }),
      ]);
      expect(await auth.api.getSession({ headers: new Headers() })).toBe(null);
      await database.close();
      await expect(auth.api.getSession({ headers: new Headers() })).rejects.toThrow(
        "Drizzle activation is closed",
      );
    }),
);
