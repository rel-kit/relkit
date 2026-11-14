/**
 * Runs the built CLI on Node, which loads no dotenv file by itself: `db migrate`, `env check` and
 * `env list` must read the application's environment files, with process values taking precedence.
 */
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { app, builtCli, config, nodeCli, write } from "./fixture.js";

const repository = resolve(import.meta.dir, "../../../..");

test("the built CLI exists for the Node tests", () => {
  expect(existsSync(builtCli)).toBe(true);
});

test("db migrate on Node reads DATABASE_PATH from .env, and a process value wins", async () => {
  const root = await app();
  await config(
    root,
    '(() => { const url = process.env.DATABASE_PATH; if (!url) throw new Error("Set DATABASE_PATH to the persistent SQLite file"); return {dialect:"sqlite",out:"./history",dbCredentials:{url}}; })()',
  );
  await write(root, ".env", "DATABASE_PATH=./dotenv.sqlite\n");
  await write(root, ".env.local", "DATABASE_PATH=./local.sqlite\n");
  await write(root, ".env.example", "DATABASE_PATH=./example.sqlite\n");
  const fromFiles = await nodeCli(root, ["--json", "db", "migrate"], { DATABASE_PATH: undefined });
  expect(fromFiles.stderr).toBe("");
  expect(fromFiles.code).toBe(0);
  // `.env.local` has higher precedence than `.env`; examples are never loaded.
  expect(existsSync(join(root, "local.sqlite"))).toBe(true);
  expect(existsSync(join(root, "dotenv.sqlite"))).toBe(false);
  const fromProcess = await nodeCli(root, ["--json", "db", "migrate"], {
    DATABASE_PATH: "./process.sqlite",
  });
  expect(fromProcess.code).toBe(0);
  expect(existsSync(join(root, "process.sqlite"))).toBe(true);
  expect(existsSync(join(root, "example.sqlite"))).toBe(false);
}, 30_000);

test("env check and env list on Node report variables set in .env as set", async () => {
  const root = await app();
  await symlink(join(repository, "packages/relkit"), join(root, "node_modules/relkit"));
  await write(
    root,
    "src/platform/env.ts",
    [
      'import { defineEnv, env } from "relkit/config";',
      "export default defineEnv({ FROM_FILE: env.string(), FROM_PROCESS: env.string() });",
      "",
    ].join("\n"),
  );
  await write(root, ".env", "FROM_FILE=file\nFROM_PROCESS=file\n");
  const check = await nodeCli(root, ["--json", "env", "check"], {
    FROM_FILE: undefined,
    FROM_PROCESS: "process",
  });
  expect(check.stderr).toBe("");
  expect(check.code).toBe(0);
  const checked = JSON.parse(check.stdout);
  expect(checked.ok).toBe(true);
  const list = await nodeCli(root, ["--json", "env", "list"], {
    FROM_FILE: undefined,
    FROM_PROCESS: undefined,
  });
  expect(list.code).toBe(0);
  const statuses = Object.fromEntries(
    JSON.parse(list.stdout).items.map((item: { name: string; status: string }) => [
      item.name,
      item.status,
    ]),
  );
  expect(statuses).toEqual({ FROM_FILE: "set", FROM_PROCESS: "set" });
  // Without the file, the same contract reports both as missing.
  await write(root, ".env", "");
  const missing = await nodeCli(root, ["--json", "env", "check"], {
    FROM_FILE: undefined,
    FROM_PROCESS: undefined,
  });
  expect(missing.code).toBe(1);
}, 30_000);
