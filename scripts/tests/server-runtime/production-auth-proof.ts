/** Exercises repaired production SQLite and native Better Auth through real requests. */
import { strict as assert } from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Schema } from "effect";
import { runCommand } from "../../pack-and-smoke-create-relkit-support.js";

/** Fixture-only environment; the owned runtime assigns its actual URL before startup. */
export const PRODUCTION_AUTH_SECRET =
  "isolated-production-proof-secret-never-use-in-production-12345";

/**
 * Initializes maintained migrations twice and checks the installed SDK's actual rollback path.
 * @param root - Owned acceptance fixture or relocated application root.
 * @returns The owned migrated SQLite database path after two migrations and real rollback verification.
 */
export async function prepareProductionDatabase(root: string): Promise<string> {
  const state = join(root, ".relkit/state");
  await mkdir(state, { recursive: true });
  const path = join(root, ".relkit/build/migrate-proof.mjs");
  await writeFile(
    path,
    `
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { sql } from "drizzle-orm";
const declarations = readFileSync(join(dirname(Bun.resolveSync("drizzle-orm", import.meta.dirname)), "sqlite-core/effect/db.d.ts"), "utf8");
assert.ok(declarations.includes('from "effect/sql/SqlError"'));
assert.ok(!declarations.includes('from "effect/unstable/sql/SqlError"'));
const sqlite = new Database(process.argv[2]);
try {
  const database = drizzle({ client: sqlite });
  migrate(database, { migrationsFolder: process.argv[3] });
  migrate(database, { migrationsFolder: process.argv[3] });
  sqlite.exec("CREATE TABLE __production_rollback (value INTEGER)");
  assert.throws(() => database.transaction((transaction) => {
    transaction.run(sql.raw("INSERT INTO __production_rollback VALUES (42)"));
    throw new Error("production-rollback");
  }), /production-rollback/);
  assert.equal(sqlite.query("SELECT count(*) AS count FROM __production_rollback").get().count, 0);
} finally { sqlite.close(); }
`,
  );
  const database = join(state, "auth.sqlite");
  await runCommand(["run", "--no-env-file", path, database, join(root, "migrations")], root);
  return database;
}

/**
 * Verifies real signup, authenticated lookup, signout invalidation and signin.
 * @param url - Actual allocated HTTP origin of the owned production server.
 * @returns After signup, authenticated lookup, signout invalidation and fresh signin pass.
 */
export async function verifyProductionAuth(url: string): Promise<void> {
  const session = await signupProductionAuth(url);
  await signInProductionAuth(url, session);
}

/**
 * Acquires a native session with real migrated SQLite tables.
 * @param url - Actual allocated HTTP origin of the owned production server.
 * @returns Native credentials, origin headers and the issued authenticated session cookie.
 */
async function signupProductionAuth(url: string) {
  assert.equal((await fetch(`${url}/account/profile`)).status, 401);
  const credentials = {
    name: "Production",
    email: "production@example.com",
    password: "password123",
  };
  const headers = { "content-type": "application/json", origin: url };
  const signup = await fetch(`${url}/api/auth/sign-up/email`, {
    method: "POST",
    headers,
    body: JSON.stringify(credentials),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(signup.status, 200, await signup.text());
  const cookie = signup.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie?.includes("better-auth"));
  const profile = await fetch(`${url}/account/profile`, { headers: { cookie } });
  assert.equal(profile.status, 200);
  const response = await fetch(`${url}/api/auth/get-session`, { headers: { cookie } });
  const session = Schema.decodeUnknownSync(
    Schema.Struct({ user: Schema.Struct({ email: Schema.String }) }),
  )(await response.json());
  assert.equal(session.user.email, credentials.email);
  return { credentials, headers, cookie };
}

/**
 * Confirms persisted authentication works across invalidation and fresh session issuance.
 * @param url - Actual allocated HTTP origin of the owned production server.
 * @param session - Native signup credentials, origin headers and authenticated session cookie.
 * @returns After signout invalidation and a fresh signin produce the expected authorization behavior.
 */
async function signInProductionAuth(
  url: string,
  session: Awaited<ReturnType<typeof signupProductionAuth>>,
) {
  const signout = await fetch(`${url}/api/auth/sign-out`, {
    method: "POST",
    headers: { ...session.headers, cookie: session.cookie },
    body: "{}",
  });
  assert.equal(signout.status, 200);
  assert.equal(
    (await fetch(`${url}/account/profile`, { headers: { cookie: session.cookie } })).status,
    401,
  );
  const signin = await fetch(`${url}/api/auth/sign-in/email`, {
    method: "POST",
    headers: session.headers,
    body: JSON.stringify(session.credentials),
  });
  assert.equal(signin.status, 200, await signin.text());
  const cookie = signin.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie?.includes("better-auth"));
  assert.equal((await fetch(`${url}/account/profile`, { headers: { cookie } })).status, 200);
}
