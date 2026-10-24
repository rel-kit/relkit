/** Retains original rollback assertions for add-transaction, registered by the owning suite. */
import { expect } from "bun:test";
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ADD_FAILURE_CODES, applyScaffoldPlan } from "../../packages/cli/src/scaffolding/index.ts";
import { createPlan, withRoot } from "./add-transaction.fixture.js";
export async function case2Rollback() {
  await withRoot(async (root) => {
    const packagePath = join(root, "package.json");
    const original = `{ "name": "before" }\n`;
    await writeFile(packagePath, original);
    await chmod(packagePath, 0o640);
    await writeFile(join(root, "bun.lock"), "original-lock\n");
    await writeFile(join(root, "dirty.txt"), "mine\n");
    const plan = createPlan(root, {
      dependencies: { dependency: "1.0.0" },
      operations: [
        { path: "package.json", action: "update", content: `{ "name": "after" }\n` },
        { path: "src/orders/functions/new.function.ts", action: "create", content: "new\n" },
      ],
    });

    await expect(
      applyScaffoldPlan(plan, {
        commandRunner: async () => {
          await writeFile(join(root, "bun.lock"), "changed-lock\n");
          return { exitCode: 1, stderr: "install failed" };
        },
      }),
    ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.installation });
    expect(await readFile(packagePath, "utf8")).toBe(original);
    expect((await stat(packagePath)).mode & 0o777).toBe(0o640);
    expect(await readFile(join(root, "bun.lock"), "utf8")).toBe("original-lock\n");
    expect(await readFile(join(root, "dirty.txt"), "utf8")).toBe("mine\n");
    expect(await Bun.file(join(root, "src/orders/functions/new.function.ts")).exists()).toBeFalse();
  });
}

export async function case5Rollback() {
  await withRoot(async (root) => {
    const outside = await mkdtemp(join(tmpdir(), "relkit-add-outside-"));
    try {
      await symlink(outside, join(root, "linked"));
      const plan = createPlan(root, {
        operations: [{ path: "linked/value.ts", action: "create", content: "export {};\n" }],
      });
      await expect(applyScaffoldPlan(plan)).rejects.toMatchObject({
        code: ADD_FAILURE_CODES.collision,
      });
      expect(await Bun.file(join(outside, "value.ts")).exists()).toBeFalse();
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
}
