/** Verifies native Node rejection and Bun acceptance of explicitly runtime-conditioned public exports. */
import { test, expect } from "bun:test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { ScaffoldProcess, scaffoldProcessLayer } from "../scaffold-process.js";
import { runCommand } from "../pack-and-smoke-create-relkit-support.js";

test("checks Bun-only public leaves with their native runtime and rejects Node access", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-export-conditions-"));
  try {
    const owner = join(root, "node_modules", "condition-fixture");
    await mkdir(owner, { recursive: true });
    const exports = { ".": { import: "./shared.js" }, "./server": { bun: "./server.js" } };
    await writeFile(
      join(owner, "package.json"),
      JSON.stringify({
        name: "condition-fixture",
        type: "module",
        exports,
      }),
    );
    await writeFile(join(owner, "shared.js"), "export const shared = true;");
    await writeFile(
      join(owner, "server.js"),
      'if (!globalThis.Bun) throw new Error("Bun required");',
    );
    await writeFile(
      join(root, "expected-exports.json"),
      JSON.stringify({ "condition-fixture": exports }),
    );
    await cp(
      resolve(import.meta.dirname, "../../tests/exports/fixture/resolve.mjs"),
      join(root, "resolve.mjs"),
    );
    const node = await Effect.runPromise(
      Effect.flatMap(ScaffoldProcess, (process) =>
        process.run({ executable: "node", args: ["resolve.mjs"], cwd: root }),
      ).pipe(Effect.provide(scaffoldProcessLayer)),
    );
    expect(node).toContain("packed entries resolved; internal paths rejected");
    expect(await runCommand(["resolve.mjs", "--bun-only"], root)).toContain(
      "Bun-only public entries resolved",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
