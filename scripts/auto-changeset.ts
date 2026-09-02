import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { workspacePackageDirectories } from "./workspace-packages.js";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");

type Options = {
  readonly base: string;
  readonly head: string;
  readonly pr: string;
  readonly summary: string;
  readonly write: boolean;
};

function value(args: readonly string[], index: number, name: string): string {
  const result = args[index + 1];
  if (result === undefined) throw new Error(`${name} requires a value`);
  return result;
}

function options(args: readonly string[]): Options {
  let base: string | undefined;
  let head: string | undefined;
  let pr: string | undefined;
  let summary = "";
  let write = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--base") base = value(args, index++, argument);
    else if (argument === "--head") head = value(args, index++, argument);
    else if (argument === "--pr") pr = value(args, index++, argument);
    else if (argument === "--summary") summary = value(args, index++, argument);
    else if (argument === "--write") write = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (!base || !head || !pr) throw new Error("--base, --head, and --pr are required");
  if (!/^\d+$/.test(pr)) throw new Error("--pr must be numeric");
  return { base, head, pr, summary, write };
}

export function isChangeset(path: string): boolean {
  return path.startsWith(".changeset/") && path.endsWith(".md") && basename(path) !== "README.md";
}

export function affectedPackages(
  paths: readonly string[],
  packages: ReadonlyMap<string, string>,
): string[] {
  const affected = new Set<string>();
  for (const path of paths) {
    for (const [directory, packageName] of packages)
      if (path === directory || path.startsWith(`${directory}/`)) affected.add(packageName);
    if (
      path.startsWith("templates/default/v1/") ||
      path === "scripts/package-create-relkit-templates.ts"
    )
      affected.add("create-relkit");
    if (path.startsWith("apps/inspector/") || path === "scripts/package-inspector.ts")
      affected.add("@relkit/cli");
    if (path === "LICENSE" || path === "tsconfig.base.json")
      for (const name of packages.values()) affected.add(name);
  }
  return [...affected].sort();
}

export function renderChangeset(packages: readonly string[], summary: string): string {
  const release = [...new Set(packages)].sort().map((name) => `${JSON.stringify(name)}: patch`);
  if (release.length === 0) throw new Error("Cannot render an empty Changeset");
  return `---\n${release.join("\n")}\n---\n\n${summary.trim()}\n`;
}

export function changedPathArguments(base: string, head: string): string[] {
  return ["diff", "--no-renames", "--name-only", "-z", `${base}...${head}`];
}

export function hasCurrentChangeset(
  paths: readonly string[],
  exists: (path: string) => boolean,
): boolean {
  return paths.some((path) => isChangeset(path) && exists(path));
}

async function publishablePackages(): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const directory of workspacePackageDirectories(root)) {
    const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      name?: string;
      private?: boolean;
    };
    if (manifest.private !== true && manifest.name)
      result.set(relative(root, directory), manifest.name);
  }
  return result;
}

async function changedPaths(base: string, head: string): Promise<string[]> {
  const { stdout } = await exec("git", changedPathArguments(base, head), {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.toString("utf8").split("\0").filter(Boolean);
}

async function main(): Promise<void> {
  const input = options(process.argv.slice(2));
  const paths = await changedPaths(input.base, input.head);
  if (hasCurrentChangeset(paths, (path) => existsSync(join(root, path)))) {
    console.log(JSON.stringify({ created: false, reason: "changeset-present" }));
    return;
  }
  const affected = affectedPackages(paths, await publishablePackages());
  if (affected.length === 0) {
    console.log(JSON.stringify({ created: false, reason: "no-release-paths" }));
    return;
  }
  if (!input.write)
    throw new Error(`Release-impacting paths require a Changeset: ${affected.join(", ")}`);
  const summary =
    input.summary.trim().replace(/\s+/g, " ") || `Release changes from PR #${input.pr}.`;
  const path = join(root, ".changeset", `auto-pr-${input.pr}.md`);
  await writeFile(path, renderChangeset(affected, summary));
  console.log(JSON.stringify({ created: true, path, packages: affected }));
}

if (import.meta.main)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
