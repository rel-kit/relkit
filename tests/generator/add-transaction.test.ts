import { describe, expect, spyOn, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ADD_FAILURE_CODES,
  applyScaffoldPlan,
  type ScaffoldPlan,
} from "../../packages/create-relkit/src/index.ts";

describe("add scaffold transaction", () => {
  test("validates with the project CLI instead of an unrelated global install", async () => {
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
  });
  test("restores bytes, modes, lockfile, and leaves unrelated dirty files", async () => {
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
      expect(
        await Bun.file(join(root, "src/orders/functions/new.function.ts")).exists(),
      ).toBeFalse();
    });
  });

  test("rolls back validation failure and applies a successful plan", async () => {
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
  });

  test("skips checking unavailable packages with no install", async () => {
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
  });

  test("refuses project-local symlinks without writing through them", async () => {
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
  });
});

function createPlan(
  root: string,
  overrides: Partial<ScaffoldPlan> & { readonly install?: boolean } = {},
): ScaffoldPlan {
  return {
    projectRoot: root,
    request: {
      kind: "function",
      name: "value",
      projectRoot: root,
      install: overrides.install ?? true,
      internal: false,
    },
    operations: [],
    dependencies: {},
    artifacts: [],
    profiles: [],
    warnings: [],
    nextSteps: [],
    ...overrides,
  };
}

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "relkit-add-transaction-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
