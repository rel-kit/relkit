import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createTestApplication } from "@relkit/testing";
import config from "../../relkit.config.js";

const baseURL = "http://127.0.0.1:3000";
const projectRoot = resolve(import.meta.dir, "../..");

test("real HTTP sessions validate orders and isolate owners without losing existing data", async () => {
  const root = mkdtempSync(join(tmpdir(), "relkit-final-guidance-auth-"));
  const path = join(root, "app.sqlite");
  const oldSecret = process.env.BETTER_AUTH_SECRET;
  const oldURL = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_SECRET = "isolated-guidance-session-secret-for-local-tests-only";
  process.env.BETTER_AUTH_URL = baseURL;
  let app: Awaited<ReturnType<typeof createTestApplication>> | undefined;
  try {
    const seed = new Database(path, { create: true });
    try {
      seed.exec(await Bun.file(new URL("../../../fixture-sql/existing.sql", import.meta.url)).text());
      seed.exec(await Bun.file(new URL("../../../fixture-sql/extension.sql", import.meta.url)).text());
    } finally { seed.close(); }
    app = await createTestApplication(config, {
      projectRoot,
      resourceProviders: "fake",
      env: {
        DATABASE_PATH: path,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: baseURL,
      },
    });
    const http = app.http;
    const request = (pathname: string, init?: RequestInit) => http.request(baseURL + pathname, init);
    const signup = async (name: string) => {
      const response = await request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseURL },
        body: JSON.stringify({ name, email: name + "@example.test", password: "owned-local-password-123" }),
      });
      expect(response.status).toBe(200);
      const body = await response.json() as { user: { id: string } };
      const cookie = response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
      expect(cookie.length).toBeGreaterThan(0);
      return { id: body.user.id, cookie };
    };
    const alice = await signup("alice");
    const bob = await signup("bob");
    const aliceHeaders = { cookie: alice.cookie, "content-type": "application/json", origin: baseURL };
    const bobHeaders = { cookie: bob.cookie, "content-type": "application/json", origin: baseURL };
    expect((await request("/users/me")).status).toBe(401);
    expect((await request("/orders")).status).toBe(401);
    expect((await request("/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku: "book-1", quantity: 1 }) })).status).toBe(401);
    const profile = await request("/users/me", { headers: aliceHeaders });
    expect(profile.status).toBe(200);
    expect(await profile.json()).toEqual({ id: alice.id, name: "alice", email: "alice@example.test" });
    const currentSession = await request("/api/auth/get-session", { headers: bobHeaders });
    expect(currentSession.status).toBe(200);
    expect((await currentSession.json() as { user: { id: string } }).user.id).toBe(bob.id);
    for (const invalid of [{ sku: "", quantity: 1 }, { sku: "   ", quantity: 1 }, { sku: "book-1", quantity: 0 }, { sku: "book-1", quantity: 1.5 }, { sku: "book-1", quantity: "1" }]) {
      const response = await request("/orders", { method: "POST", headers: aliceHeaders, body: JSON.stringify(invalid) });
      expect(response.status).toBe(422);
      await response.text();
    }
    const created = await request("/orders", { method: "POST", headers: aliceHeaders, body: JSON.stringify({ sku: "book-1", quantity: 2, ownerId: bob.id }) });
    expect(created.status).toBe(201);
    const aliceOrder = await created.json() as { id: string; ownerId: string; sku: string; quantity: number };
    expect(aliceOrder).toEqual({ id: expect.any(String), ownerId: alice.id, sku: "book-1", quantity: 2 });
    const bobCreated = await request("/orders", { method: "POST", headers: bobHeaders, body: JSON.stringify({ sku: "book-2", quantity: 1 }) });
    expect(bobCreated.status).toBe(201);
    const bobOrder = await bobCreated.json();
    const aliceList = await request("/orders?ownerId=" + bob.id, { headers: aliceHeaders });
    expect(aliceList.status).toBe(200);
    expect(await aliceList.json()).toEqual([aliceOrder]);
    const bobList = await request("/orders?ownerId=" + alice.id, { headers: bobHeaders });
    expect(bobList.status).toBe(200);
    expect(await bobList.json()).toEqual([bobOrder]);
    const signout = await request("/api/auth/sign-out", { method: "POST", headers: aliceHeaders, body: "{}" });
    expect(signout.status).toBe(200);
    await signout.text();
    expect((await request("/users/me", { headers: aliceHeaders })).status).toBe(401);
    expect((await request("/users/me", { headers: bobHeaders })).status).toBe(200);
    await app.close();
    app = undefined;
    const persisted = new Database(path, { readonly: true });
    try {
      expect(persisted.query("SELECT content FROM notes WHERE id = 0").get()).toEqual({ content: "Preserve this existing record" });
      expect(persisted.query("SELECT COUNT(*) AS count FROM orders").get()).toEqual({ count: 2 });
      expect(persisted.query("SELECT owner_id AS ownerId FROM orders WHERE id = ?").get(aliceOrder.id)).toEqual({ ownerId: alice.id });
    } finally { persisted.close(); }
  } finally {
    await app?.close();
    if (oldSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = oldSecret;
    if (oldURL === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = oldURL;
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
