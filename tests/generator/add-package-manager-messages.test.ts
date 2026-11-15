/**
 * `relkit add` names the project's package manager in everything it prints (the next steps, the
 * check command, the skipped-verification reason, the failed-install text) and runs the install that
 * may update the lockfile, so a pnpm project under `CI` does not fail on a frozen install.
 */
import { expect } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  applyScaffoldPlan,
  formatAddResult,
  normalizeAddRequest,
  planAdd,
} from "../../packages/cli/src/scaffolding/index.ts";
import { packageManagerCommands } from "../../packages/create-relkit/src/package-manager.ts";
import { addTest as test, project, registerAddCleanup } from "./add-acceptance-fixture.js";

registerAddCleanup();

/** The two managers that are not Bun, with a `packageManager` field each. */
const MANAGERS = [
  { name: "npm", field: "npm@11.19.1" },
  { name: "pnpm", field: "pnpm@11.1.0" },
] as const;

/**
 * Creates the minimal project for one manager.
 * @param field - `packageManager` field value.
 * @returns Project root.
 */
async function projectFor(field: string) {
  const root = await project("minimal");
  const path = join(root, "package.json");
  const authored = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, `${JSON.stringify({ ...authored, packageManager: field }, null, 2)}\n`);
  return root;
}

/**
 * Applies one add with a recording command runner.
 * @param root - Project root.
 * @param args - Add arguments.
 * @param exitCode - Exit code of the install command; the check always passes.
 * @param stderr - Standard error of a failing install.
 * @returns The commands the transaction ran, and the apply promise.
 */
function run(root: string, args: readonly string[], exitCode = 0, stderr = "") {
  const commands: string[][] = [];
  const result = planAdd(normalizeAddRequest([...args, "--project-root", root])).then((plan) =>
    applyScaffoldPlan(plan, {
      relkitExecutable: "relkit",
      commandRunner: async (command) => {
        commands.push([...command]);
        const isInstall = command[1] === "install";
        return isInstall ? { exitCode, stderr } : { exitCode: 0 };
      },
    }),
  );
  return { commands, result };
}

for (const { name, field } of MANAGERS) {
  const manager = packageManagerCommands(name);

  test(`relkit add inspector without an install prints ${name} commands only`, async () => {
    const root = await projectFor(field);
    const { commands, result } = run(root, ["inspector", "--no-install"]);
    const added = await result;
    expect(commands).toEqual([]);
    expect(added.nextSteps).toEqual([
      manager.run("dev"),
      manager.run("inspector"),
      manager.installText,
      manager.run("check"),
    ]);
    expect(added.verification).toMatchObject({ status: "skipped", command: manager.run("check") });
    expect(formatAddResult(added)).not.toMatch(/\bbun\b/);
  }, 60_000);

  test(`relkit add database without an install says which ${name} command applies the patch`, async () => {
    const root = await projectFor(field);
    const added = await run(root, ["database", "--dialect", "sqlite", "--no-install"]).result;
    expect(added.nextSteps).toContain(manager.run("db:migrate"));
    expect(added.nextSteps).toContain(manager.installText);
    expect(added.nextSteps).toContain(manager.run("check"));
    expect(added.nextSteps.join("\n")).not.toMatch(/\bbun\b/);
    if (name === "pnpm")
      expect(added.verification).toMatchObject({
        reason: `Dependency patches require ${manager.installText} before checking the project.`,
      });
  }, 60_000);

  test(`relkit add inspector installs with ${name} install and reports the ${name} check`, async () => {
    const root = await projectFor(field);
    const { commands, result } = run(root, ["inspector"]);
    const added = await result;
    expect(commands[0]).toEqual([name, ...manager.install]);
    expect(added.verification).toEqual({ status: "passed", command: manager.run("check") });
    expect(formatAddResult(added)).not.toMatch(/\bbun\b/);
  }, 60_000);

  test(`a failed ${name} install names the ${name} command`, async () => {
    const root = await projectFor(field);
    const { result } = run(root, ["inspector"], 1, "registry unreachable");
    await expect(result).rejects.toMatchObject({
      code: "RELKIT_ADD_INSTALLATION_FAILED",
      message: `${manager.installText} failed: registry unreachable`,
    });
  }, 60_000);
}

test("the pnpm install add runs does not freeze the lockfile", async () => {
  const root = await projectFor("pnpm@11.1.0");
  const { commands, result } = run(root, ["database", "--dialect", "sqlite"]);
  await result;
  expect(commands[0]).toEqual(["pnpm", "install", "--no-frozen-lockfile"]);
}, 60_000);
