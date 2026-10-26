/** Verifies incremental build pruning removes retired support while preserving active/generated and foreign paths. */
import { expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { pruneCliOutput } from "../prune-cli-output.js";

test("prunes obsolete UI/store artifacts and keeps current telemetry configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-cli-prune-"));
  try {
    await mkdir(join(root, "commands"));
    await mkdir(join(root, "inspector"));
    for (const name of [
      "dev-telemetry.js",
      "dev-telemetry.types.d.ts",
      "dev-process.js.map",
      "dev-telemetry-config.js",
      "dev-capture.service.js",
    ])
      await writeFile(join(root, "commands", name), "owned generated");
    await Effect.runPromise(pruneCliOutput(root));
    expect(await readFile(join(root, "commands/dev-telemetry-config.js"), "utf8")).toBe(
      "owned generated",
    );
    expect(await readFile(join(root, "commands/dev-capture.service.js"), "utf8")).toBe(
      "owned generated",
    );
    await expect(readFile(join(root, "commands/dev-telemetry.js"))).rejects.toThrow();
    await expect(readFile(join(root, "commands/dev-telemetry.types.d.ts"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a symlink instead of deleting a foreign output tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-cli-prune-link-"));
  try {
    const foreign = join(root, "foreign");
    await mkdir(foreign);
    await writeFile(join(foreign, "keep"), "foreign");
    await symlink(foreign, join(root, "linked"));
    await expect(Effect.runPromise(pruneCliOutput(join(root, "linked")))).rejects.toThrow();
    expect(await readFile(join(foreign, "keep"), "utf8")).toBe("foreign");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.each([
  ["commands", "dev-telemetry.js"],
  ["dev-snapshot", "duckdb-worker.js"],
])("rejects a symlink at the %s output boundary", async (directory, name) => {
  const root = await mkdtemp(join(tmpdir(), "relkit-cli-prune-intermediate-"));
  try {
    const output = join(root, "dist");
    const foreign = join(root, "foreign");
    await mkdir(output);
    await mkdir(foreign);
    await writeFile(join(foreign, name), "user-owned");
    await symlink(foreign, join(output, directory));
    await expect(Effect.runPromise(pruneCliOutput(output))).rejects.toThrow();
    expect(await readFile(join(foreign, name), "utf8")).toBe("user-owned");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
