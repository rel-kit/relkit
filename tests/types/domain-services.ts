import { defineBetterAuthService } from "@relkit/better-auth";
import { defineDrizzleService, defineModel, type DatabaseContext } from "@relkit/drizzle";
import { defineEvent } from "@relkit/events";
import { defineFunction, type AuthContext } from "@relkit/functions";
import { defineServiceRoutes } from "@relkit/routes";
import { z } from "@relkit/schema";
import { defineService } from "@relkit/services";
import {
  sqliteTable,
  text,
} from "../../packages/drizzle/node_modules/drizzle-orm/sqlite-core/index.js";

const getOrder = defineFunction({
  id: "orders.get",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: async ({ id }) => ({ id }),
});
const created = defineEvent({
  id: "orders.created",
  version: 1,
  payload: z.object({ id: z.string() }),
});
const internal = defineFunction({
  id: "orders.internal",
  input: z.object({}),
  output: z.object({}),
  handler: async () => ({}),
});
const orders = defineService({ functions: { getOrder }, events: { created } });
const original: typeof getOrder = orders.getOrder;
void original;

defineService({});
defineService({ events: { created } });
defineServiceRoutes(orders, { GET: "getOrder", POST: { member: "getOrder", successStatus: 201 } });
// @ts-expect-error ALL is reserved for raw handlers
defineServiceRoutes(orders, { ALL: "getOrder" });
// @ts-expect-error events cannot be route targets
defineServiceRoutes(orders, { GET: "created" });
// @ts-expect-error functions outside the public service facade cannot be selected
defineServiceRoutes(orders, { GET: "internal" });
void internal;

const user = sqliteTable("user", { email: text().primaryKey() });
const userModel = defineModel({
  table: user,
  extend: {
    byEmail: ({ table }, email: string) => ({ table, email }),
  },
});
const database = defineDrizzleService({
  schema: { user },
  client: () => ({}) as never,
  models: { user: userModel },
});
declare const contextDatabase: DatabaseContext<typeof database>;
contextDatabase.user.byEmail("user@example.com");
// @ts-expect-error model consumers do not pass the injected context argument
contextDatabase.user.byEmail({ table: user }, "user@example.com");

defineBetterAuthService({ emailAndPassword: { enabled: true } });
// @ts-expect-error the Drizzle service supplies the Better Auth database
defineBetterAuthService({ database: {} });
// @ts-expect-error basePath is inferred from the auth route
defineBetterAuthService({ basePath: "/api/auth" });

declare const authContext: AuthContext<{ readonly user: { readonly id: string } }>;
const session = await authContext.getSession();
void session?.user.id;
