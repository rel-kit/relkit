/**
 * Exercises private-stage preparation through the public creation adapter.
 * Injected process results prove preparation precedes atomic publication, its
 * artifacts survive relocation, and rejection leaves an existing destination
 * untouched. These tests do not claim packed runtime or timing acceptance.
 */
import { afterEach, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateProject } from "../src/generate.js";
import { normalizeCreateOptions } from "../src/options.js";

const roots: string[] = [];
const templateRoot = resolve(import.meta.dir, "../../../templates/default/v1");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("finite preparation is the only compiler command and its artifact survives atomic rename", async () => {
  const root = await temporaryRoot();
  const executed: string[][] = [];
  const result = await generateProject(normalizeCreateOptions(["prepared", "--no-git"]), {
    cwd: root,
    templateRoot,
    relkitExecutable: "relkit",
    commandRunner: async (command, stage) => {
      executed.push([...command]);
      expect((await readdir(root)).includes("prepared")).toBe(false);
      if (command[1] === "dev") {
        await mkdir(join(stage, ".relkit/dev-snapshot"), { recursive: true });
        await writeFile(
          join(stage, ".relkit/dev-snapshot/prepared-test.json"),
          '{"portable":true}\n',
        );
      }
      return { exitCode: 0 };
    },
  });
  expect(executed.map((command) => command[1])).toEqual(["install", "doctor", "dev"]);
  expect(executed[2]?.slice(1, 4)).toEqual(["dev", "--prepare", "--project-root"]);
  expect(
    await readFile(join(result.destination, ".relkit/dev-snapshot/prepared-test.json"), "utf8"),
  ).toBe('{"portable":true}\n');
  expect((await readdir(root)).filter((name) => name.startsWith(".prepared-relkit-"))).toEqual([]);
});

test("preparation rejection cleans its private stage and preserves an existing empty destination", async () => {
  const root = await temporaryRoot();
  await mkdir(join(root, "prepared"));
  await expect(
    generateProject(normalizeCreateOptions(["prepared", "--no-git", "--force-empty-directory"]), {
      cwd: root,
      templateRoot,
      relkitExecutable: "relkit",
      commandRunner: async (command) => ({
        exitCode: command[1] === "dev" ? 1 : 0,
        stderr: "invalid source",
      }),
    }),
  ).rejects.toMatchObject({ code: "RELKIT_CREATE_PREPARE_FAILED" });
  expect(await readdir(root)).toEqual(["prepared"]);
  expect(await readdir(join(root, "prepared"))).toEqual([]);
});

test("no-install performs no preparation subprocess and reports the finite workflow", async () => {
  const root = await temporaryRoot();
  const result = await generateProject(
    normalizeCreateOptions(["prepared", "--no-install", "--no-git"]),
    {
      cwd: root,
      templateRoot,
      commandRunner: async () => {
        throw new Error("Unexpected subprocess for no-install creation.");
      },
    },
  );
  expect(result.warnings[0]?.message).toContain("relkit dev --prepare");
  await expect(access(join(result.destination, ".relkit/dev-snapshot"))).rejects.toThrow();
});

/** Allocates and registers a root owned only by this suite.
 * @returns Private directory, removed by the test cleanup hook.
 */
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-stage-prepare-"));
  roots.push(root);
  return root;
}
