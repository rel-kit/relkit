/**
 * Runs the PostgreSQL and MySQL conformance module on Bun (Bun SQL) and on Node (`pg`, `mysql2`).
 * PostgreSQL runs against a throwaway database on the local server, skipped when `createdb` cannot
 * reach one; MySQL only loads its client, as no server is part of the local suite.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";

const MODULE = fileURLToPath(new URL("./conformance/server-conformance.mjs", import.meta.url));
const database = `relkit_g09_drizzle_${process.pid}_${Date.now()}`;
const available =
  spawnSync("psql", ["-h", "localhost", "-d", "postgres", "-Atc", "select 1"]).status === 0;

/**
 * Runs the module on one runtime.
 * @param runtime - `bun` or `node`.
 * @param environment - Values added to the environment.
 * @returns Exit status and output.
 */
function run(runtime: string, environment: Record<string, string>) {
  return spawnSync(runtime, [MODULE], {
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
}

beforeAll(() => {
  if (available) expect(spawnSync("createdb", ["-h", "localhost", database]).status).toBe(0);
});
afterAll(() => {
  if (available) spawnSync("dropdb", ["-h", "localhost", "--if-exists", database]);
});

test.each(["bun", "node"])(
  "loads the PostgreSQL and MySQL clients on %s without connecting",
  (runtime) => {
    for (const dialect of ["pg", "mysql"]) {
      const result = run(runtime, { DIALECT: dialect, CHECK_LOAD: "1" });
      expect(result.status, result.stderr + result.stdout).toBe(0);
      expect(result.stdout).toContain(`${dialect} client loaded on ${runtime}`);
    }
  },
  60_000,
);

test.skipIf(!available).each(["bun", "node"])(
  "writes and reads a PostgreSQL database on %s",
  (runtime) => {
    const result = run(runtime, {
      DIALECT: "pg",
      DATABASE_URL: `postgres://localhost:5432/${database}`,
    });
    // Each runtime creates the same table; drop it so the other runtime starts clean.
    spawnSync("psql", ["-h", "localhost", "-d", database, "-c", "drop table if exists items"]);
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(result.stdout).toContain(`pg conformance passed on ${runtime}`);
  },
  60_000,
);
