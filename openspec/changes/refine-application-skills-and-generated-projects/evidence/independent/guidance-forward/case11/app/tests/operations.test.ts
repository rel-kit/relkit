import { expect, test } from "bun:test";
import { activateDrizzleService } from "@relkit/drizzle";
import { invokeFunction } from "@relkit/testing";
import database from "../src/services/database/service.js";
import users from "../src/services/users/service.js";
import orders from "../src/services/orders/service.js";

// Explicit session fake: this does not verify Better Auth cookies or login.
test("session guard, validation and order ownership with isolated SQLite", async () => {
  const active = await activateDrizzleService(database, { DATABASE_PATH: ":memory:" }, { isolated: true });
  const options = (id: string | null) => ({ context: ({ signal }: { signal: AbortSignal }) => ({
    signal,
    database: active.context,
    auth: { getSession: async () => id === null ? null : { user: { id, email: id + "@example.test" } } },
  }) });
  try {
    active.client.$client.exec(await Bun.file(new URL("../src/services/database/migrations/0001-orders.sql", import.meta.url)).text());
    await expect(invokeFunction(users.profile, {}, options(null))).rejects.toBeDefined();
    expect(await invokeFunction(users.profile, {}, options("alice"))).toEqual({ id: "alice", email: "alice@example.test" });
    await expect(invokeFunction(orders.create, { label: "A book" }, options(null))).rejects.toBeDefined();
    await expect(invokeFunction(orders.create, { label: "" }, options("alice"))).rejects.toBeDefined();
    const a = await invokeFunction(orders.create, { label: "A book" }, options("alice"));
    const other = await invokeFunction(orders.create, { label: "Other book" }, options("bob"));
    expect(a.userId).toBe("alice");
    expect(other.userId).toBe("bob");
    expect(await invokeFunction(orders.list, {}, options("alice"))).toEqual([a]);
    expect(await invokeFunction(orders.list, {}, options("bob"))).toEqual([other]);
    await expect(invokeFunction(orders.list, {}, options(null))).rejects.toBeDefined();
  } finally { await active.close(); }
});
