/** Exercises Bun's built-in ws alias using actual installed upstream package bytes. Metadata resolution must still inventory that contained package and reject an external symlink; no SDK code or declarations are substituted. */
import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect, Exit } from "effect";
import { resolveConsumerPackage } from "../consumer-installation-native.js";

/** Locates the actual ws dependency from the installed platform adapter's importer context.
 * @returns Upstream package directory without evaluating its executable entrypoint.
 */
async function installedWs() {
  const importer = await realpath(
    resolve(
      import.meta.dir,
      "../../packages/runtime-effect/node_modules/@effect/platform-node-shared",
    ),
  );
  const search =
    createRequire(join(importer, "package.json")).resolve.paths("ws/package.json") ?? [];
  const source = search
    .map((base) => join(base, "ws"))
    .find((path) => existsSync(join(path, "package.json")));
  if (source === undefined) throw new Error("Installed platform adapter ws dependency is absent");
  return realpath(source);
}

test("Bun built-in alias still inventories the actual contained ws package", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "relkit-builtin-package-")));
  try {
    const source = await installedWs();
    await mkdir(join(root, "node_modules"));
    await cp(source, join(root, "node_modules/ws"), { recursive: true });
    expect(createRequire(join(root, "package.json")).resolve.paths("ws")).toBeNull();
    const found = await Effect.runPromise(resolveConsumerPackage(root, root, "ws"));
    expect(found).toBe(join(root, "node_modules/ws"));
  } finally {
    await rm(root, { recursive: true });
  }
});

test("built-in alias metadata resolution still rejects an external ws package", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "relkit-builtin-outside-")));
  try {
    const source = await installedWs();
    await mkdir(join(root, "node_modules"));
    await symlink(source, join(root, "node_modules/ws"), "dir");
    const result = await Effect.runPromise(Effect.exit(resolveConsumerPackage(root, root, "ws")));
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result))
      expect(result.cause.reasons[0]).toMatchObject({
        _tag: "Fail",
        error: { operation: "package.containment" },
      });
  } finally {
    await rm(root, { recursive: true });
  }
});
