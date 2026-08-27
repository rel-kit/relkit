import { afterEach, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GenerateProjectError, generateProject } from "../../packages/create-relkit/src/index.ts";
import type {
  GenerateFailurePoint,
  GenerateProjectContext,
} from "../../packages/create-relkit/src/index.ts";
import { cleanupStagedProject } from "../../packages/create-relkit/src/generate-files.ts";

const roots: string[] = [];
const failurePoints: readonly GenerateFailurePoint[] = [
  "copy",
  "substitute",
  "install",
  "git",
  "doctor",
  "check",
  "rename",
];

for (const point of failurePoints) {
  test(`cleans the staged sibling after an injected ${point} failure`, async () => {
    const root = await makeRoot();
    const failure = await captureFailure(point, root);

    expect(failure).toBeInstanceOf(GenerateProjectError);
    expect(failure.code).toBe(`RELKIT_CREATE_${point.toUpperCase()}_FAILED`);
    expect(failure.temporaryPath).toBeString();
    expect(failure.message).toContain(`Temporary directory cleaned: ${failure.temporaryPath}.`);
    await expect(access(join(root, "generated-app"))).rejects.toThrow();
    expect((await readdir(root)).some((name) => name.startsWith(".generated-app-relkit-"))).toBe(
      false,
    );
  });
}

test("preserves an existing empty destination when publication fails", async () => {
  const root = await makeRoot();
  const destination = join(root, "existing-app");
  await mkdir(destination);
  const before = await readdir(destination);
  const options = createOptions({ directory: "existing-app", forceEmptyDirectory: true });

  await expect(generateProject(options, contextFor(root, "rename"))).rejects.toMatchObject({
    code: "RELKIT_CREATE_RENAME_FAILED",
  });
  expect(await readdir(destination)).toEqual(before);
  expect(
    (await readdir(root)).filter((name) => name.startsWith(".existing-app-relkit-")).length,
  ).toBe(0);
});

test("refuses broad cleanup paths without recursive deletion", async () => {
  const root = await makeRoot();
  const result = await cleanupStagedProject(tmpdir(), join(root, "generated-app"));

  expect(result).toEqual({ removed: false });
  await access(tmpdir());
});

async function captureFailure(
  point: GenerateFailurePoint,
  root: string,
): Promise<GenerateProjectError> {
  try {
    await generateProject(createOptions({ install: point === "install" }), contextFor(root, point));
  } catch (error) {
    if (error instanceof GenerateProjectError) return error;
    throw error;
  }
  throw new Error(`Expected ${point} to fail.`);
}

function createOptions(
  overrides: Partial<{
    readonly directory: string;
    readonly forceEmptyDirectory: boolean;
    readonly install: boolean;
  }> = {},
) {
  return {
    name: "generated-app",
    template: "minimal" as const,
    cloud: "none" as const,
    deploy: "none" as const,
    install: false,
    git: true,
    examples: true,
    forceEmptyDirectory: false,
    json: false,
    ...overrides,
  };
}

function contextFor(root: string, point: GenerateFailurePoint): GenerateProjectContext {
  return {
    cwd: root,
    templateRoot: resolve(import.meta.dir, "../../templates/default/v1"),
    commandRunner: async () => ({ exitCode: 0 }),
    failAt: (actual) => {
      if (actual === point) throw new Error(`Injected ${point} failure.`);
    },
  };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-create-cleanup-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
