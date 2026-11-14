/**
 * A database added with `relkit add database` runs on every Tier 1 runtime: for each dialect the
 * generated project passes `relkit check` on Node (built CLI, Bun hand-off disabled) and on Bun,
 * and the generated PostgreSQL service answers a query on both runtimes against a throwaway local
 * database (skipped when `createdb` cannot reach a server). MySQL is checked, never connected.
 * Node runs need `turbo run build --filter=@relkit/cli --filter=@relkit/drizzle`.
 */
import { expect, test as nativeTest } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  add,
  addTest as test,
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

/**
 * Generates a minimal project with a database of one dialect and its installed packages linked.
 * @param dialect - Database dialect.
 * @returns Project root.
 */
async function databaseProject(dialect: "sqlite" | "postgresql" | "mysql") {
  const root = await project("minimal");
  await add(root, ["database", "--dialect", dialect, "--no-install"]);
  await linkDependencies(root);
  await linkDriver(root, dialect);
  return root;
}

for (const dialect of ["sqlite", "postgresql", "mysql"] as const) {
  test(`a generated ${dialect} service imports nothing runtime-specific and checks on Node and Bun`, async () => {
    const root = await databaseProject(dialect);
    const env = { DATABASE_URL: "postgres://relkit@127.0.0.1:1/unused" };
    for (const runtime of ["node", "bun"] as const) {
      const result = await runOn(runtime, root, ["check", "--project-root", root, "--json"], env);
      expect(result.code, `${runtime}: ${result.stdout}${result.stderr}`).toBe(0);
      expect(JSON.parse(result.stdout).diagnostics).toEqual([]);
    }
    const service = await readFile(join(root, "src/services/database/service.ts"), "utf8");
    expect(service).not.toMatch(/["'](?:bun|bun:[^"']+|drizzle-orm\/bun-[^"']+|node:[^"']+)["']/u);
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    expect(manifest.scripts["db:generate"]).toBe("drizzle-kit generate");
    expect(manifest.dependencies).toMatchObject(
      { sqlite: {}, postgresql: { pg: expect.any(String) }, mysql: { mysql2: expect.any(String) } }[
        dialect
      ],
    );
  }, 90_000);
}

test("the generated SQLite scripts generate and migrate on Node with the path only in .env", async () => {
  const root = await databaseProject("sqlite");
  await linkDrizzleKit(root);
  await Bun.write(join(root, ".env"), "DATABASE_PATH=./.relkit/state/node.sqlite\n");
  const kit = join(root, "node_modules/drizzle-kit/bin.cjs");
  const generate = Bun.spawnSync(["node", kit, "generate"], {
    cwd: root,
    env: { ...process.env, DATABASE_PATH: undefined, npm_config_user_agent: undefined },
  });
  expect(generate.exitCode, `${generate.stdout}${generate.stderr}`).toBe(0);
  const migrate = await runOn("node", root, ["--json", "db", "migrate"], {});
  expect(migrate.code, migrate.stdout + migrate.stderr).toBe(0);
  expect(JSON.parse(migrate.stdout)).toMatchObject({ history: 1, applied: 1 });
  expect(await Bun.file(join(root, ".relkit/state/node.sqlite")).exists()).toBe(true);
}, 90_000);

(postgres ? test : nativeTest.skip)(
  "the generated PostgreSQL service answers a query on Node and on Bun",
  async () => {
    const database = `relkit_g09_${process.pid}_${Date.now()}`;
    expect(Bun.spawnSync(["createdb", "-h", "localhost", database]).exitCode).toBe(0);
    try {
      const root = await databaseProject("postgresql");
      await Bun.write(
        join(root, "probe.ts"),
        [
          'import { activateDrizzleService } from "@relkit/drizzle";',
          'import { sql } from "drizzle-orm";',
          'import service from "./src/services/database/service.ts";',
          "const active = await activateDrizzleService(service, process.env);",
          "const rows = await active.client.execute(sql`select 40 + 2 as answer`);",
          'console.log("ANSWER", JSON.stringify([...(rows.rows ?? rows)]));',
          "await active.close();",
          "",
        ].join("\n"),
      );
      const env = { DATABASE_URL: `postgres://localhost:5432/${database}` };
      for (const runtime of ["node", "bun"] as const) {
        const result = await runOn(runtime, root, [join(root, "probe.ts")], env, "script");
        expect(result.code, `${runtime}: ${result.stdout}${result.stderr}`).toBe(0);
        expect(result.stdout, runtime).toContain('ANSWER [{"answer":42}]');
      }
    } finally {
      Bun.spawnSync(["dropdb", "-h", "localhost", "--if-exists", database]);
    }
  },
  90_000,
);

test("the built CLI exists for the Node runs", async () => {
  expect(await Bun.file(join(repository, "packages/cli/dist/bin.js")).exists()).toBe(true);
});
