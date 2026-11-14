/**
 * Migrates a throwaway local PostgreSQL database with the built CLI on Node and the real
 * drizzle-kit, `DATABASE_URL` coming only from `.env`. Skipped when no local server is reachable
 * through `createdb`; the database is dropped afterwards.
 */
import { expect, test } from "bun:test";
import { readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { app, config, nodeCli, write } from "./fixture.js";

const hoisted = resolve(import.meta.dir, "../../../../node_modules/.bun/node_modules");
const available =
  Bun.spawnSync(["psql", "-h", "localhost", "-d", "postgres", "-Atc", "select 1"], {
    stdout: "ignore",
    stderr: "ignore",
  }).exitCode === 0;

/**
 * Creates a PostgreSQL application fixture with real drizzle-kit and pg.
 * @returns Application root.
 */
async function postgresApp() {
  const root = await app();
  for (const name of ["drizzle-kit", "pg"])
    await symlink(join(hoisted, name), join(root, "node_modules", name));
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  manifest.dependencies.pg = "*";
  await writeFile(join(root, "package.json"), JSON.stringify(manifest));
  await config(
    root,
    '(() => { const url = process.env.DATABASE_URL; if (!url) throw new Error("Set DATABASE_URL to the database you intend to migrate"); return {dialect:"postgresql",out:"./history",dbCredentials:{url}}; })()',
  );
  return root;
}

/**
 * Runs `psql` against a database.
 * @param database - Database name.
 * @param sql - One statement.
 * @returns Unaligned output.
 */
function psql(database: string, sql: string) {
  const result = Bun.spawnSync(["psql", "-h", "localhost", "-d", database, "-Atc", sql]);
  return result.stdout.toString().trim();
}

test.skipIf(!available)(
  "db migrate on Node migrates PostgreSQL with DATABASE_URL only in .env",
  async () => {
    const database = `relkit_g08_${process.pid}_${Date.now()}`;
    expect(Bun.spawnSync(["createdb", "-h", "localhost", database]).exitCode).toBe(0);
    try {
      const root = await postgresApp();
      await write(root, ".env", `DATABASE_URL=postgres://localhost:5432/${database}\n`);
      const first = await nodeCli(root, ["--json", "db", "migrate"], { DATABASE_URL: undefined });
      expect(first.stderr).toBe("");
      expect(first.code).toBe(0);
      expect(psql(database, "select count(*) from entries")).toBe("0");
      expect(psql(database, 'select count(*) from drizzle."__drizzle_migrations"')).toBe("1");
      expect(JSON.parse(first.stdout)).toMatchObject({ history: 1, applied: 1 });
      // A process value wins over the file, which now names a database that does not exist.
      await write(root, ".env", `DATABASE_URL=postgres://localhost:5432/${database}_absent\n`);
      const repeat = await nodeCli(root, ["db", "migrate"], {
        DATABASE_URL: `postgres://localhost:5432/${database}`,
      });
      expect(repeat.code).toBe(0);
      expect(repeat.stdout).toContain("Database is up to date: no migrations were pending.");
    } finally {
      Bun.spawnSync(["dropdb", "-h", "localhost", "--if-exists", database]);
    }
  },
  60_000,
);
