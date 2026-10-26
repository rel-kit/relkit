/** Verifies migrated order persistence and authentication through the selected native test owner. */
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createTestApplication, type TestApplication } from "@relkit/testing/better-auth";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import config from "../../relkit.config.js";
const headers = { "content-type": "application/json", origin: "http://127.0.0.1:3000" };
test("orders persist and remain private to their owner", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-orders-guide-"));
  const path = join(root, "orders.sqlite");
  const previous = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = "isolated-test-secret-never-use-in-production-12345";
  const sqlite = new Database(path);
  try {
    await migrate(drizzle({ client: sqlite }), {
      migrationsFolder: resolve(import.meta.dir, "../../src/services/database/migrations"),
    });
  } finally {
    sqlite.close();
  }
  const app = await createTestApplication(config, {
    env: { DATABASE_PATH: path, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET },
  });
  try {
    expect((await app.http.get("/orders/order-1")).status).toBe(401);
    const alice = await signUp(app, "Alice", "alice@example.com");
    const bob = await signUp(app, "Bob", "bob@example.com");
    const created = await app.http.post("/orders", {
      headers: { ...headers, ...alice },
      body: JSON.stringify({ orderId: "order-1", sku: "book", quantity: 10 }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ totalCents: 900 });
    expect(await (await app.http.get("/orders/order-1", { headers: alice })).json()).toMatchObject({
      found: true,
    });
    expect(await (await app.http.get("/orders/order-1", { headers: bob })).json()).toEqual({
      found: false,
    });
    const invalid = await app.http.post("/orders", {
      headers: { ...headers, ...alice },
      body: JSON.stringify({ orderId: "bad", sku: "book", quantity: 0 }),
    });
    expect(invalid.status, await invalid.text()).toBe(422);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
    await rm(root, { recursive: true, force: true });
  }
});

/** Acquires the same native session cookie for each distinct order owner. */
async function signUp(app: TestApplication, name: string, email: string) {
  const response = await app.http.post("/api/auth/sign-up/email", {
    headers,
    body: JSON.stringify({ name, email, password: "local-test-password-123" }),
  });
  expect(response.status).toBe(200);
  return { cookie: response.headers.get("set-cookie")?.split(";", 1)[0] ?? "" };
}
