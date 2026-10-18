/** Isolates delegated-tool invocation/output contracts; real server-dialect acceptance is separate. */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { app, config, migrate, write } from "./fixture.js";

test("PostgreSQL/MySQL invoke only consumer Kit with literal config, cwd and safe diagnostics", async () => {
  for (const dialect of ["postgresql", "mysql"]) {
    const root = await app();
    const selected = "nested/config with spaces.ts";
    await config(
      root,
      `{dialect:${JSON.stringify(dialect)},out:"./history",dbCredentials:{url:"${dialect === "mysql" ? "mysql" : "postgres"}://private:password@127.0.0.1/owned"}}`,
      selected,
    );
    await write(
      root,
      "node_modules/drizzle-kit/package.json",
      '{"name":"drizzle-kit","exports":{"./package.json":"./package.json"}}',
    );
    await write(
      root,
      "node_modules/drizzle-kit/bin.cjs",
      `const fs = require("node:fs");
fs.writeFileSync("delegated.json",JSON.stringify({cwd:process.cwd(),argv:process.argv.slice(2),bun:!!process.versions.bun}));
console.log("private:password"); console.error("postgres://private:password@127.0.0.1/owned");`,
    );
    const result = await migrate(root, ["--config", selected]);
    expect(result.code).toBe(0);
    expect(result.stdout).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.parse(await readFile(join(root, "delegated.json"), "utf8"))).toEqual({
      cwd: root,
      argv: ["migrate", "--config", join(root, selected)],
      bun: true,
    });
    await write(
      root,
      "node_modules/drizzle-kit/bin.cjs",
      'console.error("private:password"); process.exitCode=7;',
    );
    const failure = await migrate(root, ["--config", selected]);
    expect(failure.code).toBe(1);
    expect(failure.stdout).toHaveLength(1);
    expect(JSON.stringify(failure)).not.toContain("password");
  }
});
