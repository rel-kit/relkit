/** Replays sample history in disposable applied databases and proves directory moves preserve state. */
import { expect, test } from "bun:test";
import { cp, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { app, config, migrate } from "./fixture.js";

test("both sample histories move without resetting IDs, log rows, schema or data", async () => {
  for (const sample of ["data-model", "auth-drizzle"]) {
    const root = await app();
    await cp(
      resolve(import.meta.dir, `../../../../examples/${sample}/src/services/database/migrations`),
      join(root, "old-history"),
      { recursive: true },
    );
    await config(
      root,
      '{dialect:"sqlite",out:"./old-history",dbCredentials:{url:"./data/selected.sqlite"}}',
    );
    expect((await migrate(root)).code).toBe(0);
    const client = new Database(join(root, "data/selected.sqlite"));
    try {
      if (sample === "data-model")
        client.exec("INSERT INTO users(email) VALUES ('preserved@example.com')");
      else
        client.exec(
          "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES ('preserved','User','preserved@example.com',0,1,1)",
        );
      const snapshot = () => ({
        log: client.query("SELECT * FROM __drizzle_migrations ORDER BY id").all(),
        schema: client.query("SELECT name, sql FROM sqlite_master ORDER BY name").all(),
        rows: client.query(`SELECT * FROM ${sample === "data-model" ? "users" : "user"}`).all(),
      });
      const before = snapshot();
      await rename(join(root, "old-history"), join(root, "moved-history"));
      await config(
        root,
        '{dialect:"sqlite",out:"./moved-history",dbCredentials:{url:"./data/selected.sqlite"}}',
      );
      expect((await migrate(root)).code).toBe(0);
      expect(snapshot()).toEqual(before);
    } finally {
      client.close();
    }
  }
});
