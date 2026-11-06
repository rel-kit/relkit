/** Runs the SQLite conformance module on Bun (`bun:sqlite`) and on Node (`node:sqlite`). */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const MODULE = fileURLToPath(new URL("./conformance/sqlite-conformance.mjs", import.meta.url));

test.each(["bun", "node"])(
  "opens, writes, rolls back and reopens a SQLite database on %s",
  (runtime) => {
    const result = spawnSync(runtime, [MODULE], { encoding: "utf8" });
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(result.stdout).toContain(`SQLite conformance passed on ${runtime}`);
  },
  60_000,
);
