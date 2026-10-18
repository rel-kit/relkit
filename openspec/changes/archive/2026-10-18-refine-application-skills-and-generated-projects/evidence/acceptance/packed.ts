/** Tests the actual packed CLI/generator without source links, inherited repairs or published fallback. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { Database } from "bun:sqlite";
import { fixture, hash, live, repository, type Fixture } from "./packed-support.ts";
import { protect, authHttp } from "./packed-auth.ts";

process.env.NODE_OPTIONS = "--max-old-space-size=512";
const candidate = await fixture();
try {
  await writeFile(
    join(candidate.temporary, "package.json"),
    JSON.stringify({
      name: "candidate-parent",
      private: true,
      type: "module",
      dependencies: { "@relkit/cli": candidate.version, "create-relkit": candidate.version },
    }),
  );
  await candidate.install("parent-install", candidate.temporary);
  candidate.observations.parentIdentity = await candidate.identity(candidate.temporary);
  const parentBin = (name: string) => join(candidate.temporary, "node_modules/.bin", name);
  let packedSkillFiles = 0;
  for (const template of ["minimal", "api", "agent", "fullstack", "tasks"]) {
    const skillRoot = join(repository, "templates/default/v1", template, ".agents/skills/relkit");
    for await (const file of new Bun.Glob("**/*").scan({ cwd: skillRoot, onlyFiles: true })) {
    const relative = `.agents/skills/relkit/${file}`;
    assert.equal(
      hash(
        await readFile(
          join(
            candidate.temporary,
            "node_modules/create-relkit/dist/templates/default/v1",
            template,
            relative,
          ),
        ),
      ),
      hash(await readFile(join(repository, "templates/default/v1", template, relative))),
    );
    packedSkillFiles++;
    }
  }
  assert.equal(packedSkillFiles, 65);
  candidate.observations.packedSkillFiles = packedSkillFiles;
  candidate.observations.packedSkillsMatch = true;
  const projects: string[] = [];
  for (const entry of ["direct", "cli"]) {
    const directory = "consumer-" + entry;
    await candidate.run("create-" + entry, [
      parentBin(entry === "direct" ? "create-relkit" : "relkit"),
      ...(entry === "direct" ? [] : ["create"]),
      "acceptance-app",
      "--directory",
      directory,
      "--template",
      "minimal",
      "--cloud",
      "none",
      "--deploy",
      "none",
      "--examples",
      "--no-install",
      "--no-git",
      "--json",
    ]);
    const root = join(candidate.temporary, directory);
    projects.push(root);
    if (candidate.observations[entry + "NoDatabase"]) continue;
    await candidate.install(entry + "-install", root);
    await candidate.install(entry + "-frozen", root, true);
    candidate.observations[entry + "Identity"] = await candidate.identity(root);
    const require = createRequire(join(root, "package.json"));
    // @relkit/testing brings an ORM transitively; physically remove it for CLI independence proof.
    const optional = join(root, "node_modules/drizzle-orm");
    const removed = join(root, "disabled-orm");
    const resolved = require.resolve("drizzle-orm");
    assert.ok(resolved.startsWith(root + "/"));
    await rename(optional, removed);
    try {
      assert.equal(existsSync(optional), false);
      const absent = Bun.spawnSync([process.execPath, "--smol", "-e", 'for (const name of ["drizzle-orm", "drizzle-kit"]) { try { require.resolve(name); process.exit(1); } catch {} }'], { cwd: root });
      assert.equal(absent.exitCode, 0, "A migration dependency is still reachable from the no-database app");
      for (const [suffix, args] of [
        ["help-without-orm", ["db", "migrate", "--help"]],
        ["check-without-orm", ["check"]],
        ["dev-prepare-without-orm", ["dev", "--prepare"]],
      ] as const)
        await candidate.run(entry + "-" + suffix, [join(root, "node_modules/.bin/relkit"), ...args], root);
    } finally {
      await rename(removed, optional);
    }
    for (const script of ["check", "typecheck", "test", "build"])
      await candidate.run(entry + "-" + script, ["run", script], root);
    await candidate.run(
      entry + "-prepare",
      [join(root, "node_modules/.bin/relkit"), "dev", "--prepare"],
      root,
    );
    await live(root, async () => {});
    candidate.observations[entry + "NoDatabase"] = {
      ormAbsent: true,
      kitAbsent: true,
      help: true,
      prepare: true,
      startHello: true,
    };
    await candidate.save();
  }
  await databaseFlow(candidate, projects[0]!, false);
  await databaseFlow(candidate, projects[1]!, true);
  candidate.observations.passed = true;
} catch (error) {
  candidate.observations.blocker = String(error);
  throw error;
} finally {
  await candidate.close();
}

async function databaseFlow(context: Fixture, root: string, chained: boolean) {
  const label = chained ? "auth-chained" : "existing-database-auth";
  if (context.observations[label + "HTTP"]) return;
  const bin = join(root, "node_modules/.bin/relkit");
  const portOwner = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
  const port = typeof context.observations[label + "Port"] === "number"
    ? context.observations[label + "Port"] as number : portOwner.port!;
  await portOwner.stop(true);
  context.observations[label + "Port"] = port;
  await context.save();
  process.env.DATABASE_PATH = "./acceptance.sqlite";
  process.env.BETTER_AUTH_URL = `http://127.0.0.1:${port}`;
  process.env.BETTER_AUTH_SECRET = "isolated-packed-acceptance-secret-not-for-production-123456";
  await context.run(
    label + "-add",
    [
      bin,
      "--json",
      "add",
      chained ? "auth" : "database",
      chained ? "--database-dialect" : "--dialect",
      "sqlite",
      "--no-install",
    ],
    root,
  );
  if (!context.done(label + "-migrate")) assert.equal(existsSync(join(root, "acceptance.sqlite")), false);
  assert.equal(existsSync(join(root, "scripts/migrate.ts")), false);
  const manifest = await Bun.file(join(root, "package.json")).json();
  assert.equal(manifest.scripts["db:migrate"], "relkit db migrate");
  const patch = Object.values(manifest.patchedDependencies)[0] as string;
  assert.equal(
    hash(await readFile(join(root, patch))),
    "10ea188b9409dd19aac7bf27f4b12911ae4844c063362b9c2bd11d6a3d936374",
  );
  await context.install(label + "-install", root);
  await context.install(label + "-frozen", root, true);
  await context.run(label + "-generate", ["run", "db:generate", "--name=initial"], root);
  await context.run(label + "-migrate", ["run", "db:migrate"], root);
  if (chained) {
    const schemaPath = join(root, "src/services/database/schema/index.ts");
    const source = (await readFile(schemaPath, "utf8")).replace('\nimport { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";\n', '\n');
    await writeFile(schemaPath, source);
    if (!source.includes('sqliteTable("items"'))
      await writeFile(schemaPath, source + '\nexport const items = sqliteTable("items", { id: integer().primaryKey({ autoIncrement: true }), name: text().notNull() });\n');
    await context.run(label + "-business-generate", ["run", "db:generate", "--name=business"], root);
    await context.run(label + "-business-migrate", ["run", "db:migrate"], root);
  }
  const db = new Database(join(root, "acceptance.sqlite"));
  try {
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all();
    const initial = context.observations[label + "Initial"] as { log: unknown[] } | undefined;
    const log = initial?.log ?? db.query("SELECT * FROM __drizzle_migrations").all();
    context.observations[label + "Initial"] ??= { tables, log };
    if (db.query("SELECT name FROM items").all().length === 0)
      db.exec("INSERT INTO items (name) VALUES ('business-row-survives');");
    if (!chained) {
      await context.run(
        label + "-auth-add",
        [bin, "--json", "add", "auth", "--database-dialect", "sqlite", "--no-install"],
        root,
      );
      await context.install(label + "-auth-install", root);
      await context.run(label + "-auth-generate", ["run", "db:generate", "--name=auth"], root);
      await context.run(label + "-auth-migrate", ["run", "db:migrate"], root);
      assert.equal(db.query("SELECT * FROM __drizzle_migrations").all().length, log.length + 1);
    }
    const before = db.query("SELECT * FROM __drizzle_migrations").all();
    await context.run(label + "-repeat", ["run", "db:migrate"], root);
    assert.deepEqual(db.query("SELECT * FROM __drizzle_migrations").all(), before);
    assert.deepEqual(db.query("SELECT name FROM items").all(), [{ name: "business-row-survives" }]);
    context.observations[label + "Preservation"] = {
      log: before,
      businessRows: db.query("SELECT name FROM items").all(),
    };
  } finally {
    db.close();
  }
  await protect(root);
  for (const script of ["check", "typecheck", "test", "build"])
    await context.run(label + "-" + script, ["run", script], root);
  await live(
    root,
    async (base) => {
      context.observations[label + "HTTP"] = await authHttp(base);
    },
    port,
  );
  await context.save();
}
