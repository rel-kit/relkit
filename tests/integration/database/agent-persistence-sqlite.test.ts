import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { drizzle } from "../../../packages/drizzle/node_modules/drizzle-orm/bun-sqlite/index.js";
import {
  integer,
  sqliteTable,
  text,
} from "../../../packages/drizzle/node_modules/drizzle-orm/sqlite-core/index.js";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const worker = join(import.meta.dir, "agent-persistence-sqlite-worker.ts");
const tsx = join(repositoryRoot, "node_modules/.bun/node_modules/tsx/dist/cli.mjs");
const records = sqliteTable("app_records", {
  id: integer().primaryKey(),
  value: text().notNull(),
});

test("isolates native SQLite checkpoints and preserves real driver ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-agent-persistence-"));
  const applicationPath = join(root, "application.sqlite");
  const borrowedPath = join(root, "ai-borrowed.sqlite");
  const ownedPath = join(root, "ai-owned.sqlite");
  const application = new Database(applicationPath);
  try {
    application.run("create table app_records (id integer primary key, value text not null)");
    const applicationDb = drizzle({ client: application });
    await applicationDb.insert(records).values({ id: 1, value: "unchanged" });

    const child = Bun.spawn([Bun.which("node") ?? "node", tsx, worker, borrowedPath, ownedPath], {
      cwd: repositoryRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = new Response(child.stdout).text();
    const stderr = new Response(child.stderr).text();
    const exitCode = await child.exited;
    const [output, errors] = await Promise.all([stdout, stderr]);
    expect(exitCode, errors).toBe(0);
    const result = JSON.parse(output.trim()) as {
      readonly beforeExplicitSetup: readonly string[];
      readonly borrowedAfterRelease: {
        readonly open: boolean;
        readonly tables: readonly string[];
        readonly checkpoints: number;
      };
      readonly ownedAfterRelease: { readonly open: boolean; readonly disposeCalls: number };
    };
    expect(result).toEqual({
      beforeExplicitSetup: [],
      borrowedAfterRelease: {
        open: true,
        tables: ["checkpoints", "writes"],
        checkpoints: expect.any(Number),
      },
      ownedAfterRelease: { open: false, disposeCalls: 1 },
    });
    expect(result.borrowedAfterRelease.checkpoints).toBeGreaterThan(0);

    expect(await applicationDb.select().from(records)).toEqual([{ id: 1, value: "unchanged" }]);
    expect(tableNames(application)).toEqual(["app_records"]);
    const checkpointDatabase = new Database(borrowedPath);
    try {
      expect(tableNames(checkpointDatabase)).toEqual(["checkpoints", "writes"]);
    } finally {
      checkpointDatabase.close();
    }
  } finally {
    application.close();
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

function tableNames(database: Database): readonly string[] {
  return database
    .query<{ readonly name: string }, []>(
      "select name from sqlite_master where type = 'table' order by name",
    )
    .all()
    .map(({ name }) => name);
}
