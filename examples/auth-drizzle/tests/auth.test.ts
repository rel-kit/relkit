/** Exercises the maintained migrated auth application through real HTTP cookies and credentials.
 * Each test owns its SQLite file, environment overrides and complete application shutdown.
 */
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createTestApplication, type TestApplication } from "@relkit/testing/better-auth";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import config from "../relkit.config.js";

test("migrated auth supports sign-up, session lookup, sign-out, and sign-in", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-auth-"));
  const path = join(root, "test.sqlite");
  const previousSecret = process.env.BETTER_AUTH_SECRET;
  const previousURL = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_SECRET = "isolated-test-secret-never-use-in-production-12345";
  process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
  let application: TestApplication | undefined;
  try {
    const sqlite = new Database(path);
    try {
      const database = drizzle({ client: sqlite });
      const options = {
        migrationsFolder: resolve(import.meta.dir, "../src/services/database/migrations"),
      };
      expect(migrate(database, options)).toBeUndefined();
      expect(migrate(database, options)).toBeUndefined();
    } finally {
      sqlite.close();
    }
    application = await createTestApplication(config, {
      projectRoot: resolve(import.meta.dir, ".."),
      env: {
        DATABASE_PATH: path,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      },
    });
    const authentication = await assertSession(application);
    await assertSignIn(application, authentication);
  } finally {
    try {
      await application?.close();
    } finally {
      if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = previousSecret;
      if (previousURL === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = previousURL;
      await rm(root, { recursive: true, force: true });
    }
  }
});

/** Exercises public signup, authenticated profile lookup and native session cookies. */
async function assertSession(application: TestApplication) {
  const unauthorized = await application.http.get("/account/profile");
  expect(unauthorized.status).toBe(401);
  expect(await unauthorized.json()).toEqual({
    error: { id: "UNAUTHORIZED", message: "Authentication required" },
  });
  expect(await (await application.http.get("/session")).json()).toEqual({ authenticated: false });
  const credentials = { name: "Demo", email: "demo@example.com", password: "password123" };
  const headers = { "content-type": "application/json", origin: "http://127.0.0.1:3000" };
  const signup = await application.http.post("/api/auth/sign-up/email", {
    headers,
    body: JSON.stringify(credentials),
  });
  expect(signup.status).toBe(200);
  const cookie = signup.headers.get("set-cookie")?.split(";", 1)[0];
  expect(cookie).toContain("better-auth");
  const authenticated = { cookie: cookie ?? "" };
  const profile = await application.http.get("/account/profile", { headers: authenticated });
  expect(profile.status).toBe(200);
  expect(await profile.json()).toMatchObject({ authenticated: true });
  const session = await application.http.get("/api/auth/get-session", { headers: authenticated });
  expect(await session.json()).toMatchObject({ user: { email: credentials.email } });
  return { credentials, headers, authenticated };
}

/** Confirms signout invalidates cookies and valid credentials can acquire a fresh session. */
async function assertSignIn(
  application: TestApplication,
  { credentials, headers, authenticated }: Awaited<ReturnType<typeof assertSession>>,
) {
  const signout = await application.http.post("/api/auth/sign-out", {
    headers: { ...headers, ...authenticated },
    body: "{}",
  });
  expect(signout.status).toBe(200);
  expect((await application.http.get("/account/profile", { headers: authenticated })).status).toBe(
    401,
  );
  const invalid = await application.http.post("/api/auth/sign-in/email", {
    headers,
    body: JSON.stringify({ ...credentials, password: "wrong-password" }),
  });
  expect(invalid.status).toBe(401);
  const signin = await application.http.post("/api/auth/sign-in/email", {
    headers,
    body: JSON.stringify(credentials),
  });
  expect(signin.status).toBe(200);
  const signedInCookie = signin.headers.get("set-cookie")?.split(";", 1)[0];
  expect(signedInCookie).toContain("better-auth");
  expect(
    (
      await application.http.get("/account/profile", {
        headers: { cookie: signedInCookie ?? "" },
      })
    ).status,
  ).toBe(200);
}
