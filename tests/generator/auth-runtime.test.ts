/**
 * A project with `relkit add database` and `relkit add auth` on PostgreSQL passes `relkit check` on
 * Bun and Node, migrates, and signs up, signs in and reads the session over HTTP on Bun and Node. A
 * project created with the Better Auth 1.7.1 schema (required `account.issuer`) stops with
 * RELKIT_AUTH_SCHEMA_MISMATCH, and `relkit migrate --write`, `db:generate` and `db:migrate` bring it
 * forward with its existing user. Needs a local PostgreSQL (skipped otherwise) and
 * `turbo run build --filter=@relkit/cli --filter=@relkit/better-auth --filter=@relkit/drizzle`.
 */
import { expect, test as nativeTest } from "bun:test";
import { spawn } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  add,
  addTest,
  linkDependencies,
  project,
  registerAddCleanup,
} from "./add-acceptance-fixture.js";
import { linkDriver, linkDrizzleKit, runOn } from "./database-runtimes.fixture.js";

registerAddCleanup();
const repository = resolve(import.meta.dir, "../..");
const postgres =
  Bun.spawnSync(["psql", "-h", "localhost", "-d", "postgres", "-Atc", "select 1"], {
    stdout: "ignore",
    stderr: "ignore",
  }).exitCode === 0;
const test = postgres ? addTest : nativeTest.skip;
const credentials = { email: "ada@example.com", password: "a-long-password", name: "Ada" };

/** Generates the project, links its packages and points it at a fresh database. */
async function authProject(database: string) {
  const root = await project("minimal");
  await add(root, ["database", "--dialect", "postgresql", "--no-install"]);
  await add(root, ["auth", "--database-dialect", "postgresql", "--no-install"]);
  await linkDependencies(root);
  await linkDriver(root, "postgresql");
  await linkDrizzleKit(root);
  const env = {
    DATABASE_URL: `postgres://localhost:5432/${database}`,
    BETTER_AUTH_SECRET: "auth-runtime-test-secret-auth-runtime-test-secret",
  };
  return { root, env };
}

/** Runs drizzle-kit generate on Node, as the scaffold's `db:generate` script does. */
function generate(root: string, env: Record<string, string>, name: string) {
  const kit = join(root, "node_modules/drizzle-kit/bin.cjs");
  const result = Bun.spawnSync(["node", kit, "generate", `--name=${name}`], {
    cwd: root,
    env: { ...process.env, ...env, npm_config_user_agent: undefined },
  });
  expect(result.exitCode, `${result.stdout}${result.stderr}`).toBe(0);
}

/** Reads the SQL of the newest generated migration. */
async function newestMigration(root: string) {
  const folder = join(root, "src/services/database/migrations");
  const newest = (await readdir(folder)).sort().at(-1)!;
  return readFile(join(folder, newest, "migration.sql"), "utf8");
}

/**
 * Starts the application on one runtime and returns its origin, output and stop function: Bun
 * runs `relkit dev`; Node builds and runs `relkit start` through the built CLI. (Behind the Node
 * development proxy a same-origin `Origin` is refused as `origin-denied`, independently of auth.)
 */
async function serve(runtime: "bun" | "node", root: string, env: Record<string, string>) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const command =
    runtime === "bun"
      ? [process.execPath, join(repository, "packages/cli/src/bin.ts"), "dev"]
      : ["node", join(repository, "packages/cli/dist/bin.js"), "start"];
  if (runtime === "node") {
    const built = await runOn("node", root, ["build"], env);
    expect(built.code, built.stdout + built.stderr).toBe(0);
  }
  const child = spawn(command[0]!, command.slice(1), {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
      RELKIT_INSPECTOR_PORT: String(await freePort()),
      BETTER_AUTH_URL: origin,
      RELKIT_BUN_HANDOFF: "0",
      npm_config_user_agent: undefined,
      NODE_ENV: undefined,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const closed = new Promise<void>((done) => child.once("close", () => done()));
  const stop = async () => {
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {}
    await Promise.race([closed, Bun.sleep(5_000)]);
  };
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && child.exitCode === null) {
    if (/RELKIT_AUTH_SCHEMA_MISMATCH/u.test(output)) break;
    const ready = await fetch(`${origin}/api/auth/ok`, { signal: AbortSignal.timeout(1_000) })
      .then((response) => response.status === 200)
      .catch(() => false);
    if (ready) break;
    await Bun.sleep(200);
  }
  return { origin, output: () => output, stop };
}

/** Posts JSON to a Better Auth endpoint and returns the status and the session cookie. */
async function post(origin: string, path: string, body: object) {
  const response = await fetch(`${origin}/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

/** Reads the session the cookie carries. */
async function session(origin: string, cookie: string | undefined) {
  const response = await fetch(`${origin}/api/auth/get-session`, {
    headers: { cookie: cookie ?? "" },
  });
  return (await response.json()) as { user?: { email: string } } | null;
}

/** Signs up when asked, signs in, and reads the session back, on a running server. */
async function signFlow(origin: string, email: string, signUp: boolean) {
  if (signUp) {
    const created = await post(origin, "sign-up/email", { ...credentials, email });
    expect(created.status, created.text).toBe(200);
  }
  const signedIn = await post(origin, "sign-in/email", { email, password: credentials.password });
  expect(signedIn.status, signedIn.text).toBe(200);
  expect((await session(origin, signedIn.cookie))?.user?.email).toBe(email);
}

/** Creates a throwaway database, runs the case and drops the database. */
async function withDatabase(run: (database: string) => Promise<void>) {
  const database = `relkit_g23_${process.pid}_${Date.now()}`;
  expect(Bun.spawnSync(["createdb", "-h", "localhost", database]).exitCode).toBe(0);
  try {
    await run(database);
  } finally {
    Bun.spawnSync(["dropdb", "-h", "localhost", "--force", "--if-exists", database]);
  }
}

test(
  "a generated PostgreSQL auth project checks, migrates and signs users in on Bun and Node",
  () =>
    withDatabase(async (database) => {
      const { root, env } = await authProject(database);
      const schema = await readFile(join(root, "src/services/database/schema/auth.ts"), "utf8");
      expect(schema).not.toContain("issuer");
      for (const runtime of ["bun", "node"] as const) {
        const check = await runOn(runtime, root, ["check", "--project-root", root], env);
        expect(check.code, `${runtime}: ${check.stdout}${check.stderr}`).toBe(0);
      }
      generate(root, env, "auth");
      const migrated = await runOn("node", root, ["db", "migrate"], env);
      expect(migrated.code, migrated.stdout + migrated.stderr).toBe(0);
      for (const runtime of ["bun", "node"] as const) {
        const server = await serve(runtime, root, env);
        try {
          await signFlow(server.origin, `${runtime}@example.com`, true);
        } catch (cause) {
          throw new Error(`${runtime}: ${String(cause)}\n${server.output()}`);
        } finally {
          await server.stop();
        }
      }
    }),
  240_000,
);

test(
  "a project on the 1.7.1 schema reports the mismatch and migrates without losing its user",
  () =>
    withDatabase(async (database) => {
      const { root, env } = await authProject(database);
      const path = join(root, "src/services/database/schema/auth.ts");
      const legacy = (await readFile(path, "utf8"))
        .replace(", timestamp }", ", timestamp, uniqueIndex }")
        .replace(
          /export const account = pgTable\("account", \{\n([\s\S]*?)\n\}\);/u,
          (_match, body: string) =>
            `export const account = pgTable(\n  "account",\n  {\n${body
              .replace(
                "accountId: text().notNull(),",
                "accountId: text().notNull(),\n  issuer: text().notNull(),",
              )
              .split("\n")
              .map((line) => `  ${line}`)
              .join(
                "\n",
              )}\n  },\n  (table) => [uniqueIndex("account_issuer_account_id").on(table.issuer, table.accountId)],\n);`,
        );
      expect(legacy).toContain("issuer: text().notNull()");
      await writeFile(path, legacy);
      generate(root, env, "auth");
      expect(await newestMigration(root)).toContain('"issuer" text NOT NULL');
      expect((await runOn("node", root, ["db", "migrate"], env)).code).toBe(0);
      const sql = (statement: string) =>
        Bun.spawnSync(["psql", "-h", "localhost", "-d", database, "-Atc", statement]);
      // A user created on 1.7.1: Better Auth's own password hash, the credential account with issuer.
      const crypto = await import(
        Bun.resolveSync("better-auth/crypto", join(repository, "packages/better-auth"))
      );
      const hash = (await crypto.hashPassword(credentials.password)) as string;
      const seeded = sql(
        `insert into "user" values ('u1','Old','old@example.com',true,null,now(),now());` +
          `insert into account (id, "accountId", issuer, "providerId", "userId", password, "createdAt", "updatedAt") values ('a1','u1','credential','credential','u1','${hash}',now(),now())`,
      );
      expect(seeded.exitCode, String(seeded.stderr)).toBe(0);

      const refused = await serve("bun", root, env);
      await refused.stop();
      expect(refused.output()).toContain("RELKIT_AUTH_SCHEMA_MISMATCH");
      expect(refused.output()).toContain("Column account.issuer is required");

      const migration = await runOn("bun", root, ["migrate", "--write", "--project-root", root]);
      expect(migration.code, migration.stdout + migration.stderr).toBe(0);
      expect(migration.stdout).toContain("better-auth-account-issuer");
      expect(await readFile(path, "utf8")).not.toContain("issuer");
      generate(root, env, "drop_account_issuer");
      expect(await newestMigration(root)).toBe(
        'DROP INDEX "account_issuer_account_id";--> statement-breakpoint\nALTER TABLE "account" DROP COLUMN "issuer";',
      );
      expect((await runOn("node", root, ["db", "migrate"], env)).code).toBe(0);
      expect(String(sql(`select count(*) from account`).stdout).trim()).toBe("1");

      const server = await serve("bun", root, env);
      try {
        await signFlow(server.origin, "old@example.com", false);
        await signFlow(server.origin, "new@example.com", true);
      } catch (cause) {
        throw new Error(`${String(cause)}\n${server.output()}`);
      } finally {
        await server.stop();
      }
    }),
  240_000,
);

/** Acquires and releases a loopback port. */
async function freePort(): Promise<number> {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = server.port;
  await server.stop(true);
  return port;
}
