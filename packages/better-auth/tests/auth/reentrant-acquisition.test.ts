/** Checks that auth acquisition borrows a transaction lease without retaining it after initialization.
 * The native initializer runs under a scoped SQLite owner and later calls reacquire admission.
 */
import { expect, it } from "@effect/vitest";
import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { Effect } from "effect";
import { activateBetterAuthService, defineBetterAuthService } from "../../src/drizzle.js";
import * as authSchema from "./native-schema.js";

it.effect(
  "auth acquisition inherits a transaction lease without retaining it for later calls",
  () =>
    Effect.promise(async () => {
      const database = await activateDrizzleService(
        defineDrizzleService({ schema: authSchema, client: () => ({ run: () => undefined }) }),
        {},
        { isolated: true },
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const descriptor = defineBetterAuthService({
          baseURL: "http://localhost",
          secret: "reentrant-test-secret-at-least-32-bytes",
        });
        const auth = await Promise.race([
          database.context.transaction(() =>
            activateBetterAuthService(descriptor, database, "/api/auth"),
          ),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error("Auth acquisition deadlocked")), 1000);
            timer.unref();
          }),
        ]);
        expect(await auth.api.getSession({ headers: new Headers() })).toBe(null);
        await database.close();
        await expect(auth.api.getSession({ headers: new Headers() })).rejects.toThrow(
          "Drizzle activation is closed",
        );
      } finally {
        clearTimeout(timer);
        await database.close();
      }
    }),
);
