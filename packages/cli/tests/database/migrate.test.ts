/** Exercises real finite SQLite workers, selected configuration, safe output and lazy preflight. */
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { rm, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { app, config, migrate, write } from "./fixture.js";
import { parseEffectCli } from "../../src/cli-effect-runtime.js";

test("database help and completion are pure and share --config metadata", async () => {
  const parsed = await parseEffectCli(["db", "migrate", "--config", "nested/config.ts"], "test");
  expect(parsed.invocation).toEqual({
    command: "db",
    args: ["migrate", "--config", "nested/config.ts"],
  });
  expect((await parseEffectCli(["db", "migrate", "--help"], "test")).stdout).toContain(
    "drizzle.config.ts",
  );
  expect((await parseEffectCli(["--completions", "bash"], "test")).stdout).toContain("--config");
});

test("selected nested/absolute config owns target, output and log; repeat is a no-op", async () => {
  const root = await app();
  await config(
    root,
    '{dialect:"sqlite",out:"./history",dbCredentials:{url:"./data/selected.sqlite"},migrations:{table:"custom_log"}}',
    "nested/config.ts",
  );
  const first = await migrate(root, ["--config", "nested/config.ts"]);
  expect(first.code).toBe(0);
  expect(first.stdout).toHaveLength(1);
  expect(first.result).toMatchObject({
    ok: true,
    command: "db migrate",
    dialect: "sqlite",
    configPath: join(root, "nested/config.ts"),
    migrationPath: join(root, "history"),
  });
  const db = new Database(join(root, "data/selected.sqlite"));
  try {
    db.query("INSERT INTO entries(value) VALUES (?)").run("preserve");
    const log = db.query("SELECT * FROM custom_log").all();
    expect(log).toHaveLength(1);
    expect((await migrate(root, ["--config", join(root, "nested/config.ts")])).code).toBe(0);
    expect(db.query("SELECT * FROM custom_log").all()).toEqual(log);
    expect(db.query("SELECT value FROM entries").all()).toEqual([{ value: "preserve" }]);
  } finally {
    db.close();
  }
});

test("invalid or absent configuration/history never creates the target", async () => {
  const root = await app();
  for (const value of [
    "",
    ":memory:",
    "file::memory:?cache=shared",
    "file:temp?mode=memory",
    "file:db.sqlite?mode=ro",
    "postgres://private:secret@host/database",
  ]) {
    await config(
      root,
      `{dialect:"sqlite",out:"./history",dbCredentials:{url:${JSON.stringify(value)}}}`,
    );
    expect((await migrate(root)).code).toBe(2);
  }
  await config(
    root,
    '{dialect:"unsupported",out:"./history",dbCredentials:{url:"./data/selected.sqlite"}}',
  );
  expect((await migrate(root)).code).toBe(2);
  await config(root);
  await rm(join(root, "history"), { recursive: true });
  const result = await migrate(root);
  expect(result.code).toBe(2);
  expect(result.result.error.code).toBe("RELKIT_DB_HISTORY");
  expect(existsSync(join(root, "data"))).toBe(false);
  await rm(join(root, "drizzle.config.ts"));
  expect((await migrate(root)).code).toBe(2);
});

test("noisy config and secret-bearing exceptions produce one safe JSON result", async () => {
  const root = await app();
  await write(
    root,
    "drizzle.config.ts",
    'console.log("postgres://private:password@localhost/db"); throw new Error("credential=private-password");',
  );
  const result = await migrate(root);
  expect(result.code).toBe(2);
  expect(result.stdout).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain("private-password");
  expect(JSON.stringify(result)).not.toContain("postgres://");
});

test("empty SQL or an invalid migration timestamp fails before opening a database", async () => {
  const root = await app();
  await write(root, "history/20260101000000_first/migration.sql", "  \n");
  expect((await migrate(root)).result.error.code).toBe("RELKIT_DB_HISTORY");
  await write(
    root,
    "history/20260101000000_first/migration.sql",
    "CREATE TABLE valid(id INTEGER);",
  );
  await rename(join(root, "history/20260101000000_first"), join(root, "history/invalid_first"));
  expect((await migrate(root)).result.error.code).toBe("RELKIT_DB_HISTORY");
  expect(existsSync(join(root, "data"))).toBe(false);
});

test("SQL errors are operational failures without retry or successful publication", async () => {
  const root = await app();
  await write(root, "history/20260101000000_first/migration.sql", "THIS IS INVALID SQL;");
  const result = await migrate(root);
  expect(result.code).toBe(1);
  expect(result.stdout).toHaveLength(1);
  expect(result.result.ok).toBe(false);
});

test("missing consumer ORM is actionable without a CLI or workspace fallback", async () => {
  const root = await app();
  await rm(join(root, "node_modules/drizzle-orm"));
  const result = await migrate(root);
  expect(result.code).toBe(2);
  expect(result.result.error.message).toContain("bun add");
  expect(existsSync(join(root, "data"))).toBe(false);
  expect(
    JSON.parse(await readFile(join(root, "package.json"), "utf8")).dependencies,
  ).toHaveProperty("drizzle-orm");
});
