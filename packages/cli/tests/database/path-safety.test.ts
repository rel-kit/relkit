/** Exercises the worker's native filesystem boundary without executing selected SQL on rejection. */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { app, config, migrate, write } from "./fixture.js";

const worker = resolve(import.meta.dir, "../../src/database/migration-worker.ts");

async function invoke(root: string, destination: string) {
  const child = Bun.spawn([process.execPath, worker, "drizzle.config.ts", destination], {
    cwd: root,
    stdout: "ignore",
    stderr: "ignore",
  });
  return child.exited;
}

test("worker rejects external, sibling-prefix and symlink result directories before migration", async () => {
  const root = await app();
  const owned = await mkdtemp(join(tmpdir(), "relkit-db-migrate-"));
  try {
    await symlink(root, join(owned, "escape"));
    const destinations = [
      join(root, "result.json"),
      join(owned, `../${basename(owned)}-sibling/result.json`),
      join(owned, "escape/result.json"),
      join(owned, "unexpected.json"),
    ];
    for (const destination of destinations) {
      expect(await invoke(root, destination)).not.toBe(0);
      expect(existsSync(join(root, "data"))).toBe(false);
      expect(existsSync(destination)).toBe(false);
    }
    const link = join(tmpdir(), `relkit-db-migrate-link-${process.pid}`);
    await symlink(root, link);
    try {
      expect(await invoke(root, join(link, "result.json"))).not.toBe(0);
      expect(existsSync(join(root, "data"))).toBe(false);
    } finally {
      await rm(link);
    }
  } finally {
    await rm(owned, { recursive: true, force: true });
  }
});

test("worker never overwrites an existing result or follows a result-file symlink", async () => {
  const root = await app();
  const owned = await mkdtemp(join(tmpdir(), "relkit-db-migrate-"));
  const destination = join(owned, "result.json");
  try {
    await write(root, "preserve.txt", "untouched");
    await symlink(join(root, "preserve.txt"), destination);
    expect(await invoke(root, destination)).not.toBe(0);
    expect(await readFile(join(root, "preserve.txt"), "utf8")).toBe("untouched");
    expect(existsSync(join(root, "data"))).toBe(false);
    await rm(destination);
    await write(owned, "result.json", "existing");
    expect(await invoke(root, destination)).not.toBe(0);
    expect(await readFile(destination, "utf8")).toBe("existing");
    expect(existsSync(join(root, "data"))).toBe(false);
  } finally {
    await rm(owned, { recursive: true, force: true });
  }
});

test("explicit absolute configuration outside the app retains application-relative history and target", async () => {
  const root = await app();
  const selected = await mkdtemp(join(tmpdir(), "relkit-explicit-config-"));
  try {
    await config(selected);
    expect((await migrate(root, ["--config", join(selected, "drizzle.config.ts")])).code).toBe(0);
    expect(existsSync(join(root, "data/selected.sqlite"))).toBe(true);
    expect(existsSync(join(selected, "data"))).toBe(false);
  } finally {
    await rm(selected, { recursive: true, force: true });
  }
});
