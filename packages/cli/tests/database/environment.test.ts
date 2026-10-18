/** Checks effective dotenv/config authority and SQLite connection settings through the native CLI. */
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { app, config, nativeMigrate, write } from "./fixture.js";

test("config wins over a conflicting environment target; native SQLite pragmas are established", async () => {
  const root = await app();
  await write(
    root,
    "history/20260101000000_first/migration.sql",
    "CREATE TABLE settings(foreign_keys INTEGER, busy_timeout INTEGER);\n--> statement-breakpoint\nINSERT INTO settings SELECT foreign_keys, timeout FROM pragma_foreign_keys, pragma_busy_timeout;",
  );
  const result = await nativeMigrate(root, { DATABASE_PATH: join(root, "wrong.sqlite") });
  expect(result.code).toBe(0);
  expect(existsSync(join(root, "wrong.sqlite"))).toBe(false);
  const db = new Database(join(root, "data/selected.sqlite"));
  try {
    expect(db.query("SELECT * FROM settings").get()).toEqual({
      foreign_keys: 1,
      busy_timeout: 5000,
    });
  } finally {
    db.close();
  }
});

test("Bun dotenv supplies generated-style config, inherited variables win, examples are never loaded", async () => {
  const root = await app();
  await config(
    root,
    '{dialect:"sqlite",out:"./history",dbCredentials:{url:process.env.DATABASE_PATH}}',
  );
  await write(root, ".env", "DATABASE_PATH=./dotenv.sqlite\n");
  await write(root, ".env.example", "DATABASE_PATH=./example.sqlite\n");
  expect((await nativeMigrate(root, { DATABASE_PATH: undefined })).code).toBe(0);
  expect(existsSync(join(root, "dotenv.sqlite"))).toBe(true);
  expect((await nativeMigrate(root, { DATABASE_PATH: "./inherited.sqlite" })).code).toBe(0);
  expect(existsSync(join(root, "inherited.sqlite"))).toBe(true);
  expect(existsSync(join(root, "example.sqlite"))).toBe(false);
});
