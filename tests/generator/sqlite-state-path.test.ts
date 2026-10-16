/** Runtime SQLite files must not mutate prepared compilation inputs. */
import { expect, test } from "bun:test";
import { join } from "node:path";
import { project, add, linkDependencies, registerAddCleanup } from "./add-acceptance-fixture.js";

registerAddCleanup();

test("generated SQLite defaults place mutable state below .relkit/state", async () => {
  const root = await project("minimal");
  await add(root, ["database", "--dialect", "sqlite", "--no-install"]);
  expect(await Bun.file(join(root, "src/platform/env.ts")).text()).toContain(
    'env.string().default("./.relkit/state/app.sqlite")',
  );
  expect(await Bun.file(join(root, ".env.example")).text()).toContain(
    "DATABASE_PATH=./.relkit/state/app.sqlite",
  );
});

test("generated SQLite activation creates missing parent directories lazily", async () => {
  const root = await project("minimal");
  await add(root, ["database", "--dialect", "sqlite", "--no-install"]);
  await linkDependencies(root);
  const path = join(root, ".relkit/state/nested/runtime.sqlite");
  await Bun.write(
    join(root, "runtime-proof.ts"),
    `
    import assert from "node:assert/strict";
    import database from "./src/services/database/service.ts";
    import { drizzleRuntimeOf } from "@relkit/drizzle/internal";
    assert.equal(await Bun.file(${JSON.stringify(path)}).exists(), false, "discovery must not acquire a database");
    const runtime = drizzleRuntimeOf(database);
    for (const env of [{}, {DATABASE_PATH: ""}]) {
      await assert.rejects(async () => runtime.client({env}), /DATABASE_PATH is required/);
    }
    const db = await runtime.client({env: {DATABASE_PATH: ${JSON.stringify(path)}}});
    try { assert.equal(db.$client.query("SELECT 1 AS value").get().value, 1); }
    finally { await runtime.dispose(db); }
    console.log("PASS deferred native SQLite client creates nested state directory");
  `,
  );
  const child = Bun.spawn([process.execPath, "runtime-proof.ts"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output =
    (await new Response(child.stdout).text()) + (await new Response(child.stderr).text());
  expect(await child.exited, output).toBe(0);
});
