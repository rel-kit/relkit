/** Actual public native type exercises shared by emitted and packed consumer proof. */
export const authSource = `
import { defineBetterAuthService, type InferBetterAuthSession } from "@relkit/better-auth";
const auth = defineBetterAuthService({ emailAndPassword: { enabled: true } });
type Session = InferBetterAuthSession<typeof auth.handler>;
declare const session: Session;
const email: string = session.user.email;
const response: Promise<Response> | Response = auth.handler(new Request("http://localhost/api/auth/get-session"));
`;

export const harnessSource = `
import { createTestRuntime, createTestApplication, invokeFunction } from "@relkit/testing";
const runtime = createTestRuntime();
const closing: Promise<void> = runtime.close();
const create: typeof createTestApplication = createTestApplication;
const invoke: typeof invokeFunction = invokeFunction;
`;

export const sqliteSource = `
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { defineModel } from "@relkit/drizzle/sqlite";
import { createTestApplication } from "@relkit/testing/drizzle";
const users = sqliteTable("users", { id: integer().primaryKey(), name: text().notNull() });
const model = defineModel({
  table: users,
  extend: {
    names: ({ table, database }) => database.select({ name: table.name }).from(table),
  },
});
const service = defineDrizzleService({
  schema: { users },
  models: { users: model },
  client: () => drizzle({ client: new Database(":memory:") }),
});
async function read() {
  const active = await activateDrizzleService(service, {});
  try {
    const rows = await active.context.users.findMany({});
    const name: string | undefined = rows[0]?.name;
    const names: { name: string }[] = await active.context.users.names();
    return name;
  } finally {
    await active.close();
  }
}
const harness: typeof createTestApplication = createTestApplication;
`;

/** A wrong native extension result must remain a compiler error rather than erase into a permissive type. */
export const sqliteMisuseSource = sqliteSource.replace(
  "const names: { name: string }[] = await active.context.users.names();",
  "const invalid: number = (await active.context.users.names())[0]!.name;",
);
