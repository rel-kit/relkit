/** `db migrate` says what it did: how many migrations ran, or that nothing was pending. */
import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, migrate, write } from "./fixture.js";
import { runCli } from "../../src/main.js";
import { parseEffectCli } from "../../src/cli-effect-runtime.js";

/**
 * Runs `db migrate` with human output.
 * @param root - Application root.
 * @returns Exit status and printed lines.
 */
async function migrateText(root: string) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(["db", "migrate"], {
    cwd: root,
    installSignalHandlers: false,
    io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
  });
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

test("SQLite: the first run counts applied migrations, a repeat says nothing was pending", async () => {
  const root = await app();
  await write(
    root,
    "history/20260102000000_second/migration.sql",
    "CREATE TABLE more (id INTEGER PRIMARY KEY);\n",
  );
  const first = await migrate(root);
  expect(first.code).toBe(0);
  expect(first.result).toMatchObject({ ok: true, history: 2, applied: 2 });
  const repeat = await migrateText(root);
  expect(repeat.code).toBe(0);
  expect(repeat.stdout).toContain("Database is up to date: no migrations were pending.");
  await write(
    root,
    "history/20260103000000_third/migration.sql",
    "CREATE TABLE third (id INTEGER PRIMARY KEY);\n",
  );
  const next = await migrateText(root);
  expect(next.stdout).toContain("Applied 1 migration; the database is up to date.");
});

test("the generate hint names the project's package manager", async () => {
  const root = await app();
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ ...manifest, packageManager: "npm@11.0.0" }),
  );
  await rm(join(root, "history"), { recursive: true });
  const result = await migrate(root);
  expect(result.result.error.code).toBe("RELKIT_DB_HISTORY");
  expect(result.result.error.message).toContain("npm run db:generate");
  expect(result.result.error.message).not.toContain("bun run");
});

test("db migrate --help names the configuration and environment inputs", async () => {
  const help = (await parseEffectCli(["db", "migrate", "--help"], "test")).stdout;
  expect(help).toContain("drizzle.config.ts");
  expect(help).toContain(".env");
  expect(help).toContain("process environment");
});
