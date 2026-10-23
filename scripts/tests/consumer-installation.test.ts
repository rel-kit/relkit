/**
 * Measures real temporary installations through the collector's filesystem edge.
 * Tests catch symlink double counting, nested-package size inflation, workspace
 * escapes and missing dependency failures without starting a package manager.
 */
import { afterEach, beforeEach, expect, it } from "vitest";
import { link, lstat, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { inspectInstallation } from "../consumer-installation.js";

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "relkit-consumer-accounting-")));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/**
 * Writes one actual package and its executable entry into a test-owned root.
 * @param directory - Physical package directory.
 * @param name - Manifest package identity.
 * @param dependencies - Declared edges resolved from this package's context.
 * @returns Completion after its files settle.
 */
async function packageAt(
  directory: string,
  name: string,
  dependencies: Record<string, string> = {},
) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ name, version: "1.0.0", dependencies }),
  );
  await writeFile(join(directory, "index.js"), "export const ready = true;\n");
}

it("counts shared symlink targets once while retaining both dependency paths", async () => {
  await packageAt(root, "consumer", { left: "1.0.0", right: "1.0.0" });
  for (const name of ["left", "right"])
    await packageAt(join(root, "node_modules", name), name, { shared: "1.0.0" });
  const physical = join(root, "node_modules/.store/shared");
  await packageAt(physical, "shared");
  await symlink(physical, join(root, "node_modules/shared"));
  const result = await Effect.runPromise(inspectInstallation(root));
  expect(result.instances.map((item) => item.name).sort()).toEqual(["left", "right", "shared"]);
  expect(result.paths.map((item) => item.packages)).toContainEqual(["consumer", "left", "shared"]);
  expect(result.paths.map((item) => item.packages)).toContainEqual(["consumer", "right", "shared"]);
  expect(result.missing).toEqual([]);
});

it("reports missing direct dependencies and absent optional peers separately", async () => {
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "consumer",
      version: "1.0.0",
      dependencies: { missing: "1.0.0" },
      peerDependencies: { optional: "1.0.0" },
      peerDependenciesMeta: { optional: { optional: true } },
    }),
  );
  const result = await Effect.runPromise(inspectInstallation(root));
  expect(result.missing).toEqual([{ packages: ["consumer", "missing"], optional: false }]);
});

it("refuses resolution through an external symlink", async () => {
  await packageAt(root, "consumer", { leaked: "1.0.0" });
  await mkdir(join(root, "node_modules"));
  await symlink(import.meta.dirname, join(root, "node_modules/leaked"));
  await expect(Effect.runPromise(inspectInstallation(root))).rejects.toThrow(/outside consumer/);
});

it("keeps native assets and excludes nested node_modules from the parent size", async () => {
  await packageAt(root, "consumer", { native: "1.0.0" });
  const native = join(root, "node_modules/native");
  await packageAt(native, "native", { child: "1.0.0" });
  await packageAt(join(native, "node_modules/child"), "child");
  await writeFile(join(native, "driver.node"), "native fixture");
  const result = await Effect.runPromise(inspectInstallation(root));
  const observed = result.instances.find((item) => item.name === "native");
  expect(observed?.nativeFiles).toEqual([join(native, "driver.node")]);
  // 68 manifest bytes + 27 executable bytes + 14 native fixture bytes.
  expect(observed?.logicalBytes).toBe(109);
});

it("does not count hardlinked native file allocation twice", async () => {
  await packageAt(root, "consumer", { left: "1.0.0", right: "1.0.0" });
  const left = join(root, "node_modules/left"),
    right = join(root, "node_modules/right");
  await packageAt(left, "left");
  await packageAt(right, "right");
  await writeFile(join(left, "driver.node"), Buffer.alloc(8192, 1));
  await link(join(left, "driver.node"), join(right, "driver.node"));
  const result = await Effect.runPromise(inspectInstallation(root));
  let expected = 0;
  for (const file of [
    join(left, "package.json"),
    join(left, "index.js"),
    join(right, "package.json"),
    join(right, "index.js"),
    join(left, "driver.node"),
  ])
    expected += (await lstat(file)).blocks * 512;
  expect(result.instances.reduce((sum, item) => sum + (item.physicalBytes ?? 0), 0)).toBe(expected);
});
