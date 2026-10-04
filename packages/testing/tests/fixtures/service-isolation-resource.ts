import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { defineDrizzleService } from "@relkit/drizzle";
import { defineBetterAuthService } from "@relkit/better-auth";
import { defineRoute } from "@relkit/routes";

const records = sqliteTable("records", { id: integer().primaryKey() });
export const clients: Database[] = [];
export const releases: Database[] = [];
export const database = defineDrizzleService({
  schema: { records },
  client: () => {
    const sqlite = new Database(":memory:");
    sqlite.run("create table records (id integer primary key)");
    clients.push(sqlite);
    return drizzle({ client: sqlite });
  },
  dispose: (client) => {
    releases.push(client.$client);
    client.$client.close();
  },
});
export const auth = defineBetterAuthService({
  baseURL: "http://relkit.test",
  secret: "testing-isolated-auth-owner-secret-at-least-32-bytes",
  emailAndPassword: { enabled: true },
});
export const authRoute = defineRoute({ handler: auth.handler, auth: { protected: [] } });
