/** Regresses native SQLite migrations and generated application context admission. */
import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { mkdir, symlink } from "node:fs/promises";
import { Database } from "bun:sqlite";
import ts from "typescript";
import { buildCatalogDependency } from "../../packages/create-relkit/src/build-catalog.js";
import { project, add, linkDependencies, registerAddCleanup } from "./add-acceptance-fixture.js";

registerAddCleanup();
const repository = resolve(import.meta.dir, "../..");

test("each template admits generated context declarations to the TypeScript program", async () => {
  for (const template of ["minimal", "api", "agent", "fullstack", "tasks"]) {
    const root = await project(template);
    const generated = join(root, ".relkit/generated");
    await Bun.write(
      join(generated, "context-registry.d.ts"),
      "declare namespace Relkit { interface ApplicationEnv { TOOLING_PROBE: string } }\n",
    );
    await Bun.write(join(generated, "route-module-checks.ts"), "export {};\n");
    await Bun.write(
      join(root, "src/tooling-probe.ts"),
      "const env: Relkit.ApplicationEnv = { TOOLING_PROBE: 'yes' }; export { env };\n",
    );
    const config = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    const roots = parsed.fileNames.filter((name) =>
      /tooling-probe\.ts$|context-registry\.d\.ts$/.test(name),
    );
    const program = ts.createProgram(roots, { ...parsed.options, noLib: true, noResolve: true });
    const diagnostics = program
      .getSemanticDiagnostics()
      .filter((d) => d.file?.fileName.endsWith("tooling-probe.ts"));
    expect(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual(
      [],
    );
  }
}, 30000);

test("generated SQLite migration command creates auth tables and is repeatable under Bun", async () => {
  const root = await project("minimal");
  await add(root, ["auth", "--database-dialect", "sqlite", "--no-install"]);
  await linkDependencies(root);
  await symlink(
    join(
      repository,
      `node_modules/.bun/drizzle-kit@${buildCatalogDependency("drizzle-kit")}/node_modules/drizzle-kit`,
    ),
    join(root, "node_modules/drizzle-kit"),
  );
  await mkdir(join(root, "node_modules/.bin"), { recursive: true });
  await symlink("../drizzle-kit/bin.cjs", join(root, "node_modules/.bin/drizzle-kit"));
  await symlink(
    join(repository, "packages/cli/dist/bin.js"),
    join(root, "node_modules/.bin/relkit"),
  );
  const env = { ...process.env, DATABASE_PATH: join(root, ".relkit/state/app.sqlite") };
  const generate = Bun.spawn(
    [process.execPath, "--bun", join(root, "node_modules/drizzle-kit/bin.cjs"), "generate"],
    { cwd: root, env, stdout: "pipe", stderr: "pipe" },
  );
  const generated =
    (await new Response(generate.stdout).text()) + (await new Response(generate.stderr).text());
  expect(await generate.exited, generated).toBe(0);
  for (let run = 0; run < 2; run++) {
    const child = Bun.spawn([process.execPath, "run", "db:migrate"], {
      cwd: root,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output =
      (await new Response(child.stdout).text()) + (await new Response(child.stderr).text());
    expect(await child.exited, output).toBe(0);
  }
  const db = new Database(env.DATABASE_PATH, { readonly: true });
  try {
    expect(
      db
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user','session','account','verification')",
        )
        .all(),
    ).toHaveLength(4);
    expect(db.query("SELECT count(*) AS count FROM __drizzle_migrations").get()).toEqual({
      count: 1,
    });
  } finally {
    db.close();
  }
}, 30000);
