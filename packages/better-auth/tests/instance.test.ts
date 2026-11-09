/** Builds the auth service from the application's own Better Auth instance, in both database modes. */
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { activateBetterAuthService, defineBetterAuthService } from "../src/drizzle.ts";
import * as schema from "./auth/full-schema.ts";

const settings = {
  secret: "instance-test-secret-instance-test-secret",
  baseURL: "http://localhost",
  emailAndPassword: { enabled: true },
} as const;

/** Creates Better Auth's tables in a SQLite database. */
async function migrate(database: Database): Promise<void> {
  const { runMigrations } = await getMigrations({ ...settings, database });
  await runMigrations();
}

/** Signs a user up and reads the session back with the issued cookie. */
async function signUpAndReadSession(handler: (request: Request) => Promise<Response>) {
  const signUp = await handler(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ email: "ada@example.com", password: "a-long-password", name: "Ada" }),
    }),
  );
  expect(signUp.status).toBe(200);
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  const session = await handler(
    new Request("http://localhost/api/auth/get-session", { headers: { cookie } }),
  );
  return (await session.json()) as { user: { email: string } } | null;
}

test("an instance without a database uses the Drizzle service and mounts at /api/auth", async () => {
  const auth = betterAuth(settings);
  const service = defineBetterAuthService({ auth });
  expect(service.capability).toEqual({
    kind: "better-auth",
    basePath: "/api/auth",
    mount: true,
    database: "drizzle",
  });
  const sqlite = new Database(":memory:");
  await migrate(sqlite);
  const database = defineDrizzleService({ schema, client: () => drizzle({ client: sqlite }) });
  const active = await activateDrizzleService(database, {});
  try {
    const native = await activateBetterAuthService(service, active, "/api/auth", {
      isolated: true,
    });
    expect((await signUpAndReadSession(native.handler))?.user.email).toBe("ada@example.com");
    expect(sqlite.query("select email from user").all()).toEqual([{ email: "ada@example.com" }]);
  } finally {
    await active.close();
  }
});

test("an instance with its own database needs no Drizzle service", async () => {
  const sqlite = new Database(":memory:");
  await migrate(sqlite);
  const auth = betterAuth({ ...settings, database: sqlite, basePath: "/auth" });
  const service = defineBetterAuthService({ auth, mount: false });
  expect(service.capability).toEqual({
    kind: "better-auth",
    basePath: "/auth",
    mount: false,
    database: "custom",
  });
  const native = await activateBetterAuthService(service, undefined, "/api/auth", {
    isolated: true,
  });
  expect((await signUpAndReadSession(native.handler))?.user.email).toBe("ada@example.com");
  expect(sqlite.query("select email from user").all()).toEqual([{ email: "ada@example.com" }]);
});

test("the service rejects options it does not own", () => {
  const auth = betterAuth(settings);
  expect(() => defineBetterAuthService({ auth, basePath: "/x" } as never)).toThrow(
    'Unknown Better Auth service option "basePath"',
  );
  expect(() => defineBetterAuthService({ auth: {} } as never)).toThrow("betterAuth()");
  expect(() => defineBetterAuthService({ auth, mount: true } as never)).toThrow(
    "mount must be false",
  );
});
