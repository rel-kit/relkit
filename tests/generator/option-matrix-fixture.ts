/**
 * Owns isolated roots, fake subprocess dispatch and deterministic byte capture
 * for creation matrix tests. Its cleanup hook removes only allocated fixture
 * directories; framework packages and user-owned destinations are untouched.
 */
import { afterEach } from "bun:test";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import type {
  CreateOptions,
  GenerateProjectContext,
} from "../../packages/create-relkit/src/index.ts";
import type { GeneratedProjectSnapshot } from "./option-matrix.types.js";
const roots: string[] = [];
export const templateRoot = resolve(import.meta.dir, "../../templates/default/v1");

/** Creates a normalized tuple with explicit legacy defaults.
 * @param name - Valid package name for the isolated generated project.
 * @param overrides - Matrix choices overriding the default selection.
 * @returns Concrete creation options without environment-dependent prompt defaults.
 */
export function createOptions(
  name: string,
  overrides: Partial<Omit<CreateOptions, "name">> = {},
): CreateOptions {
  return {
    name,
    template: "minimal",
    cloud: "none",
    deploy: "none",
    install: true,
    git: true,
    examples: true,
    forceEmptyDirectory: false,
    json: false,
    ...overrides,
  };
}

/** Captures subprocess dispatch without executing installation or the compiler.
 * @param root - Private test root containing sibling stages.
 * @param commands - Ordered command evidence owned by this test.
 * @returns Substituted process authority with explicit native executable identities.
 */
export function contextFor(root: string, commands: string[][] = []): GenerateProjectContext {
  return {
    cwd: root,
    templateRoot,
    bunExecutable: "bun",
    gitExecutable: "git",
    relkitExecutable: "relkit",
    commandRunner: async (command) => {
      commands.push([...command]);
      return { exitCode: 0 };
    },
  };
}

/** Allocates a directory registered with this module's cleanup hook.
 * @returns Test-owned root removed after each matrix case.
 */
export async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-generator-matrix-"));
  roots.push(root);
  return root;
}

/** Captures complete deterministic bytes and permissions.
 * @param root - Published project owned by the calling test.
 * @returns Relative file identities suitable for relocation equality assertions.
 */
export async function snapshotProject(root: string): Promise<GeneratedProjectSnapshot> {
  const result: GeneratedProjectSnapshot = {};
  for (const path of await projectFiles(root)) {
    const info = await stat(join(root, path));
    result[path] = { mode: info.mode & 0o777, content: await readFile(join(root, path), "base64") };
  }
  return result;
}

/** Lists regular files recursively in deterministic path order.
 * @param root - Project root retained for relative identity.
 * @param current - Current recursive directory within that root.
 * @returns Sorted native fixture files; filesystem errors reject the test.
 */
export async function projectFiles(root: string, current = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await projectFiles(root, path)));
    else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
  }
  return files;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
