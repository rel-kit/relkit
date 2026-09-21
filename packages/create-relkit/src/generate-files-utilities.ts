import { access, chmod, lstat, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { GenerateProjectError } from "./generate-types.js";

export const EXAMPLE_PATH_PREFIXES = [
  "src/routes",
  "src/orders",
  "src/echo",
  "src/hello/tools",
  "src/hello/agents",
  "tests",
] as const;

export interface StageCleanupResult {
  readonly temporaryPath?: string;
  readonly removed: boolean;
}

export async function cleanupStagedProject(
  stage: string | undefined,
  destination: string,
): Promise<StageCleanupResult> {
  if (stage === undefined) return { removed: false };
  const temporaryPath = resolve(stage);
  const parent = resolve(dirname(destination));
  const prefix = `.${basename(destination)}-relkit-`;
  if (dirname(temporaryPath) !== parent || !basename(temporaryPath).startsWith(prefix))
    return { removed: false };
  try {
    const info = await lstat(temporaryPath);
    if (!info.isDirectory() || info.isSymbolicLink()) return { temporaryPath, removed: false };
    await rm(temporaryPath, { recursive: true, force: true });
    return { temporaryPath, removed: true };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return { temporaryPath, removed: true };
    return { temporaryPath, removed: false };
  }
}

export async function requireTemplate(path: string): Promise<void> {
  try {
    if ((await readdir(path)).length === 0) throw new Error("empty");
  } catch {
    throw new GenerateProjectError(
      "RELKIT_CREATE_TEMPLATE_MISSING",
      "Selected template is missing.",
    );
  }
}

export async function requireFiles(root: string, paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    try {
      await access(join(root, path));
    } catch {
      throw new GenerateProjectError(
        "RELKIT_CREATE_TEMPLATE_INVALID",
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
      "RELKIT_CREATE_TEMPLATE_INVALID",
      `Template substitution is unavailable: ${path}`,
    );
  await writeFile(
    path,
    content.slice(0, first) + after + content.slice(first + before.length),
    "utf8",
  );
  await chmod(path, 0o644);
}

export async function removeExamples(root: string): Promise<void> {
  for (const directory of EXAMPLE_PATH_PREFIXES)
    await rm(join(root, directory), { recursive: true, force: true });
}

export async function listProjectFiles(root: string, current = root): Promise<string[]> {
  const result: string[] = [];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort(compareNames)) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".relkit")
      continue;
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
  return value.replace(/^[._-]+/, "").replace(/(?<![._-])[._-]+$/, "") || "app";
}

export function compareNames(left: { name: string }, right: { name: string }): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}
