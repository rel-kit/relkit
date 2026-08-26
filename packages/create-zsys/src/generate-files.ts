import { access, chmod, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { GenerateProjectError } from "./generate.js";
import type { CreateOptions } from "./options.js";

const FILE_MODE = 0o644;
const DIRECTORY_MODE = 0o755;

export interface StageCleanupResult {
  readonly temporaryPath?: string;
  readonly removed: boolean;
}

export async function copyTemplate(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true, mode: DIRECTORY_MODE });
  await chmod(target, DIRECTORY_MODE);
  const entries = (await readdir(source, { withFileTypes: true })).sort(compareNames);
  for (const entry of entries) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) await copyTemplate(from, to);
    else if (entry.isFile()) {
      await writeFile(to, await readFile(from), { mode: FILE_MODE });
      await chmod(to, FILE_MODE);
    } else
      throw new GenerateProjectError(
        "ZSYS_CREATE_TEMPLATE_INVALID",
        "Template contains an unsupported entry.",
      );
  }
}

export async function customizeProject(root: string, options: CreateOptions): Promise<void> {
  await replaceOnce(
    join(root, "package.json"),
    '"name": "my-app"',
    `"name": ${JSON.stringify(options.name)}`,
  );
  await replaceOnce(join(root, "README.md"), "# my-app", `# ${options.name}`);
  await replaceOnce(
    join(root, "zsys.config.ts"),
    "export default defineConfig({",
    `export default defineConfig({\n  id: ${JSON.stringify(projectId(options.name))},`,
  );
  if (!options.examples) await removeExamples(root);
}

/** Removes only a verified mkdtemp sibling; broad or unresolved paths are never recursed. */
export async function cleanupStagedProject(
  stage: string | undefined,
  destination: string,
): Promise<StageCleanupResult> {
  if (stage === undefined) return { removed: false };
  const temporaryPath = resolve(stage);
  const parent = resolve(dirname(destination));
  const prefix = `.${basename(destination)}-zsys-`;
  if (dirname(temporaryPath) !== parent || !basename(temporaryPath).startsWith(prefix)) {
    return { removed: false };
  }
  try {
    const info = await lstat(temporaryPath);
    if (!info.isDirectory() || info.isSymbolicLink()) return { temporaryPath, removed: false };
    await rm(temporaryPath, { recursive: true, force: true });
    return { temporaryPath, removed: true };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { temporaryPath, removed: true };
    }
    return { temporaryPath, removed: false };
  }
}

export async function requireTemplate(path: string): Promise<void> {
  try {
    if ((await readdir(path)).length === 0) throw new Error("empty");
  } catch {
    throw new GenerateProjectError("ZSYS_CREATE_TEMPLATE_MISSING", "Selected template is missing.");
  }
}

export async function requireFiles(root: string, paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    try {
      await access(join(root, path));
    } catch {
      throw new GenerateProjectError(
        "ZSYS_CREATE_TEMPLATE_INVALID",
        `Template file is missing: ${path}`,
      );
    }
  }
}

export async function replaceOnce(path: string, before: string, after: string): Promise<void> {
  const content = await readFile(path, "utf8");
  const first = content.indexOf(before);
  if (first < 0 || first !== content.lastIndexOf(before))
    throw new GenerateProjectError(
      "ZSYS_CREATE_TEMPLATE_INVALID",
      `Template substitution is unavailable: ${path}`,
    );
  await writeFile(
    path,
    content.slice(0, first) + after + content.slice(first + before.length),
    "utf8",
  );
  await chmod(path, FILE_MODE);
}

export async function removeExamples(root: string): Promise<void> {
  for (const directory of ["src/functions", "src/routes", "src/tools", "src/agents", "tests"])
    await rm(join(root, directory), { recursive: true, force: true });
}

export async function listProjectFiles(root: string, current = root): Promise<string[]> {
  const result: string[] = [];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort(compareNames)) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".zsys") continue;
    const path = join(current, entry.name);
    if (entry.isDirectory()) result.push(...(await listProjectFiles(root, path)));
    else if (entry.isFile()) result.push(relative(root, path).replaceAll("\\", "/"));
  }
  return result;
}

export function projectId(name: string): string {
  const value = name
    .replace(/^@/, "")
    .replace("/", "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-");
  return value.replace(/^[._-]+|[._-]+$/g, "") || "app";
}

function compareNames(left: { name: string }, right: { name: string }): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}
