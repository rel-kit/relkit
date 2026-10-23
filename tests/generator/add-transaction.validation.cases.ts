/** Retains original validation assertions for add-transaction, registered by the owning suite. */
import { expect, spyOn } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ADD_FAILURE_CODES, applyScaffoldPlan } from "../../packages/cli/src/scaffolding/index.ts";
import { createPlan, withRoot } from "./add-transaction.fixture.js";
export async function case1Validation() {
  await withRoot(async (root) => {
    const bin = join(root, "node_modules/.bin/relkit");
    await mkdir(join(root, "node_modules/.bin"), { recursive: true });
    await writeFile(
      bin,
      `#!/usr/bin/env bun\nconsole.log("project CLI used");\nprocess.exit(17);\n`,
    );
    await chmod(bin, 0o755);
    const globalCli = spyOn(Bun, "which").mockReturnValue(join(root, "unrelated-global-relkit"));
    try {
      await expect(applyScaffoldPlan(createPlan(root, {}))).rejects.toMatchObject({
        code: ADD_FAILURE_CODES.validation,
        message: "project CLI used",
      });
    } finally {
      globalCli.mockRestore();
    }
  });
}

export async function case3Validation() {
  await withRoot(async (root) => {
    const plan = createPlan(root, {
      operations: [
        { path: "src/value.ts", action: "create", content: "export const value = 1;\n" },
      ],
    });
    await expect(
      applyScaffoldPlan(plan, {
        commandRunner: async () => ({ exitCode: 1, stderr: "bad check" }),
      }),
    ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.validation });
    expect(await Bun.file(join(root, "src/value.ts")).exists()).toBeFalse();

    const result = await applyScaffoldPlan(plan, {
      commandRunner: async () => ({ exitCode: 0 }),
      relkitExecutable: "relkit",
    });
    expect(result).toMatchObject({
      createdFiles: ["src/value.ts"],
      verification: { status: "passed" },
    });
  });
}

export async function case4Validation() {
  await withRoot(async (root) => {
    const plan = createPlan(root, {
      install: false,
      dependencies: { "missing-package": "1.0.0" },
      operations: [{ path: "src/value.ts", action: "create", content: "export {};\n" }],
    });
    const result = await applyScaffoldPlan(plan, {
      commandRunner: async () => {
        throw new Error("runner must not be called");
      },
    });
    expect(result.verification.status).toBe("skipped");
    expect(result.nextSteps).toEqual(["bun install", "bun run check"]);
  });
}
