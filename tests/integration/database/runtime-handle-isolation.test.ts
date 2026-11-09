/** Two `createRelkit` handles in one process each use only their own application's providers. */
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { buildProject } from "../../../packages/cli/src/commands/build.js";
import { writeGeneratedHostFixture } from "./generated-host-fixture.js";

const execute = promisify(execFile);
const repository = resolve(import.meta.dir, "../../..");

/** Builds one fixture whose database file lives in its own root. */
async function buildApplication(root: string): Promise<void> {
  await writeGeneratedHostFixture(root, repository);
  const servicePath = join(root, "src/services/database/service.ts");
  const service = await readFile(servicePath, "utf8");
  if (!service.includes("new Database(env.DATABASE_PATH)"))
    throw new Error("Fixture database service changed");
  await writeFile(
    servicePath,
    service.replace(
      "new Database(env.DATABASE_PATH)",
      `new Database(${JSON.stringify(join(root, "app.sqlite"))})`,
    ),
  );
  const database = new Database(join(root, "app.sqlite"));
  try {
    database.exec(
      await readFile(
        join(root, "src/services/database/migrations/20260831094750_auth/migration.sql"),
        "utf8",
      ),
    );
    database.exec("create table records (id integer primary key, value text not null)");
  } finally {
    database.close();
  }
  const built = await buildProject({ projectRoot: root });
  if (!built.ok) throw new Error(JSON.stringify(built.diagnostics));
}

/** Script that drives both handles concurrently and prints what each application saw. */
function script(first: string, second: string): string {
  return `import { createRelkit } from "relkit";
import firstConfig from ${JSON.stringify(join(first, "relkit.config.ts"))};
import secondConfig from ${JSON.stringify(join(second, "relkit.config.ts"))};

const [first, second] = await Promise.all([
  createRelkit(firstConfig, { root: ${JSON.stringify(first)} }),
  createRelkit(secondConfig, { root: ${JSON.stringify(second)} }),
]);
await Promise.all([
  first.database.records.insert({ data: { id: 1, value: "first" } }),
  second.database.records.insert({ data: { id: 1, value: "second" } }),
  first.database.records.insert({ data: { id: 2, value: "first" } }),
]);
const [firstRead, secondRead] = await Promise.all([
  first.functions.records.probe({ mode: "read" }),
  second.functions.records.probe({ mode: "read" }),
]);
await Promise.all([first.close(), second.close()]);
console.log(JSON.stringify({ first: firstRead.count, second: secondRead.count }));
`;
}

test("two handles in one process keep their applications apart", async () => {
  const first = await mkdtemp(join(tmpdir(), "relkit-handle-first-"));
  const second = await mkdtemp(join(tmpdir(), "relkit-handle-second-"));
  try {
    await Promise.all([buildApplication(first), buildApplication(second)]);
    await writeFile(join(first, "two-handles.ts"), script(first, second));
    const { stdout } = await execute("bun", ["run", "--no-env-file", "two-handles.ts"], {
      cwd: first,
      timeout: 60_000,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        NODE_ENV: "test",
        DATABASE_PATH: "unused-by-the-database-service",
        BETTER_AUTH_URL: "http://127.0.0.1:3000",
        BETTER_AUTH_SECRET: "generated-host-test-secret-at-least-32-bytes",
        RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS: "1000",
      },
    });
    expect(JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}")).toEqual({ first: 2, second: 1 });
    for (const [root, values] of [
      [first, ["first", "first"]],
      [second, ["second"]],
    ] as const) {
      const database = new Database(join(root, "app.sqlite"), { readonly: true });
      try {
        const rows = database.query("select value from records order by id").all();
        expect(rows.map((row) => (row as { value: string }).value)).toEqual([...values]);
      } finally {
        database.close();
      }
    }
  } finally {
    await Promise.all([
      rm(first, { recursive: true, force: true }),
      rm(second, { recursive: true, force: true }),
    ]);
  }
}, 120_000);
