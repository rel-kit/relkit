import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { defineRoute } from "@relkit/routes";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import {
  activateBetterAuthService,
  BETTER_AUTH_HANDLER,
  defineBetterAuthService,
} from "./src/index.ts";

const user = sqliteTable("user", { id: text().primaryKey(), email: text().notNull() });

test("creates a stable lazy handler and derives route protection", async () => {
  const database = defineDrizzleService({
    schema: { user },
    client: () => drizzle({ client: new Database(":memory:") }),
    dispose: (client) => client.$client.close(),
  });
  const auth = defineBetterAuthService({ emailAndPassword: { enabled: true } });
  const handler = auth.handler;
  const route = defineRoute({
    handler,
    auth: { protected: ["/orders/*", "/account/*", "/orders/*"] },
  });

  expect(auth.handler).toBe(handler);
  expect(handler[BETTER_AUTH_HANDLER].service).toBe(auth);
  expect(route.auth?.protected).toEqual(["/account/*", "/orders/*"]);
  expect((await handler(new Request("http://localhost/api/auth/session"))).status).toBe(503);

  const activeDatabase = await activateDrizzleService(database, {});
  const first = activateBetterAuthService(auth, activeDatabase, "/api/auth");
  const second = activateBetterAuthService(auth, activeDatabase, "/api/auth");
  expect(await first).toBe(await second);
  expect(auth.handler).toBe(handler);
  await activeDatabase.close();
});

test("forbids database and basePath options", () => {
  expect(() => defineBetterAuthService({ database: {} } as never)).toThrow("database");
  expect(() => defineBetterAuthService({ basePath: "/auth" } as never)).toThrow("basePath");
});
