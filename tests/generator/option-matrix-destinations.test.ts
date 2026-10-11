/**
 * Verifies destination/name rejection and rollback against real isolated sibling
 * stages. No dependencies or servers are installed: injected process results
 * let faults exercise ownership and publication without external side effects.
 */
import { expect, test } from "bun:test";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  generateProject,
  isValidPackageName,
  type GenerateFailurePoint,
} from "../../packages/create-relkit/src/index.ts";
import { makeRoot, contextFor, createOptions } from "./option-matrix-fixture.js";

test("accepts valid names and rejects invalid names without mutation", async () => {
  const valid = ["my-app", "a.b", "a_b", "a~b", "@scope/package"];
  const invalid = [
    "",
    ".hidden",
    "_hidden",
    "My-App",
    "scope/package",
    "@scope",
    "@/package",
    "node_modules",
    "favicon.ico",
    "x".repeat(215),
    null,
    42,
  ];
  for (const name of valid) expect(isValidPackageName(name)).toBe(true);
  for (const name of invalid) expect(isValidPackageName(name)).toBe(false);

  const root = await makeRoot();
  await expect(
    generateProject(
      createOptions("not a package", { directory: "untouched", install: false, git: false }),
      contextFor(root),
    ),
  ).rejects.toMatchObject({ code: "RELKIT_CREATE_NAME_INVALID" });
  expect(await readdir(root)).toEqual([]);
});

test("handles absent, empty, and non-empty destinations atomically", async () => {
  const root = await makeRoot();
  const absent = await generateProject(
    createOptions("absent-app", { directory: "absent-app", install: false, git: false }),
    contextFor(root),
  );
  expect(absent.destination).toBe(join(root, "absent-app"));

  const empty = join(root, "empty-app");
  await mkdir(empty);
  await expect(
    generateProject(createOptions("empty-app", { directory: "empty-app" }), contextFor(root)),
  ).rejects.toMatchObject({ code: "RELKIT_CREATE_DESTINATION_EXISTS" });
  expect(await readdir(empty)).toEqual([]);
  const forced = await generateProject(
    createOptions("empty-app", {
      directory: "empty-app",
      forceEmptyDirectory: true,
      install: false,
      git: false,
    }),
    contextFor(root),
  );
  expect(forced.destination).toBe(empty);

  const nonEmpty = join(root, "non-empty-app");
  await mkdir(nonEmpty);
  await writeFile(join(nonEmpty, "keep.txt"), "keep");
  for (const forceEmptyDirectory of [false, true]) {
    await expect(
      generateProject(
        createOptions("non-empty-app", { directory: "non-empty-app", forceEmptyDirectory }),
        contextFor(root),
      ),
    ).rejects.toMatchObject({ code: "RELKIT_CREATE_DESTINATION_NOT_EMPTY" });
  }
  expect(await readFile(join(nonEmpty, "keep.txt"), "utf8")).toBe("keep");
});

test("rolls back every pre-rename failure and removes its temporary sibling", async () => {
  const failurePoints: readonly GenerateFailurePoint[] = [
    "copy",
    "substitute",
    "install",
    "git",
    "doctor",
    "check",
    "rename",
  ];
  const root = await makeRoot();
  for (const point of failurePoints) {
    const name = `rollback-${point}`;
    const options = createOptions(name, {
      install: ["install", "doctor", "check"].includes(point),
      git: point !== "install",
    });
    await expect(
      generateProject(options, {
        ...contextFor(root),
        failAt: (actual) => {
          if (actual === point) throw new Error(`injected ${point}`);
        },
      }),
    ).rejects.toMatchObject({ code: `RELKIT_CREATE_${point.toUpperCase()}_FAILED` });
    expect(await readdir(root)).not.toContain(name);
    expect((await readdir(root)).some((entry) => entry.startsWith(`.${name}-relkit-`))).toBe(false);
  }
});
