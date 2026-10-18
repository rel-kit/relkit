/** Proves layout-aware history ownership, actual Git ignores and scaffold-only side effects. */
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { project, add, registerAddCleanup } from "./add-acceptance-fixture.js";

registerAddCleanup();

async function webFiles(root: string): Promise<Record<string, string>> {
  const files = new Bun.Glob("web/**/*").scan({ cwd: root, onlyFiles: true });
  const result: Record<string, string> = {};
  for await (const file of files)
    result[file] = createHash("sha256")
      .update(new Uint8Array(await Bun.file(join(root, file)).arrayBuffer()))
      .digest("hex");
  return result;
}

test("database-only, auth-created and reused histories share the selected owner for every dialect", async () => {
  for (const dialect of ["sqlite", "postgresql", "mysql"]) {
    for (const reuse of [false, true]) {
      const root = await project("minimal");
      if (reuse) {
        await add(root, ["database", "--dialect", dialect, "--no-install"]);
        await Bun.write(
          join(root, "src/services/database/migrations/20260101000000_existing/migration.sql"),
          "-- preserve existing history\n",
        );
      }
      const before = reuse
        ? await Bun.file(join(root, "src/services/database/schema/index.ts")).text()
        : undefined;
      await add(root, ["auth", "--database-dialect", dialect, "--no-install"]);
      const config = await Bun.file(join(root, "drizzle.config.ts")).text();
      expect(config).toContain('out: "./src/services/database/migrations"');
      expect(
        JSON.parse(await Bun.file(join(root, "package.json")).text()).scripts["db:migrate"],
      ).toBe("relkit db migrate");
      expect(await Bun.file(join(root, "scripts/migrate.ts")).exists()).toBe(false);
      expect(await Bun.file(join(root, ".relkit/state/app.sqlite")).exists()).toBe(false);
      expect(await Bun.file(join(root, ".env")).exists()).toBe(false);
      const schema = await Bun.file(join(root, "src/services/database/schema/index.ts")).text();
      if (before !== undefined) {
        expect(schema).toContain(before.trim());
        expect(
          await Bun.file(
            join(root, "src/services/database/migrations/20260101000000_existing/migration.sql"),
          ).text(),
        ).toBe("-- preserve existing history\n");
      }
      expect(
        (await readdir(join(root, "src/services"))).filter((name) => name === "database"),
      ).toHaveLength(1);
      expect(await webFiles(root)).toEqual({});
      expect(await Bun.file(join(root, "src/routes/api/auth/[[...auth]]/route.ts")).exists()).toBe(
        true,
      );
    }
  }
});

test("all maintained templates ignore framework state/secrets/database files and retain SQL/metadata", async () => {
  for (const template of ["minimal", "api", "agent", "fullstack", "tasks"]) {
    const root = await project(template);
    const frontend = await webFiles(root);
    await add(root, ["database", "--dialect", "sqlite", "--no-install"]);
    expect(await webFiles(root)).toEqual(frontend);
    const init = Bun.spawn(["git", "init", "--quiet", root], { stdout: "pipe", stderr: "pipe" });
    expect(await init.exited).toBe(0);
    for (const [path, ignored] of [
      [".relkit/future-output/probe", true],
      [".env", true],
      [".env.local", true],
      ["local.sqlite", true],
      ["local.sqlite-wal", true],
      [".env.example", false],
      ["src/services/database/migrations/20260101000000_test/migration.sql", false],
      ["src/services/database/migrations/20260101000000_test/snapshot.json", false],
    ] as const) {
      await Bun.write(join(root, path), "probe\n");
      const child = Bun.spawn(["git", "check-ignore", "--quiet", "--no-index", path], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(await child.exited, `${template}: ${path}`).toBe(ignored ? 0 : 1);
    }
  }
}, 15000);
