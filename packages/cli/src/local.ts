import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  generateProject,
  normalizeCreateOptions,
  type CreateOptions,
  type GenerateCommandResult,
} from "create-zsys";
import { runCli } from "./main.js";
import type { CliCommandContext } from "./main-support.js";

const root = resolve(import.meta.dir, "../../..");
const cli = join(root, "packages/cli/dist/index.js");

type Manifest = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export async function useWorkspaceDependencies(projectRoot: string): Promise<string[]> {
  const path = join(projectRoot, "package.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as Manifest;
  const direct = new Set<string>();
  for (const dependencies of [manifest.dependencies, manifest.devDependencies]) {
    if (dependencies === undefined) continue;
    for (const name of Object.keys(dependencies)) {
      if (!name.startsWith("@zsys/")) continue;
      direct.add(name);
    }
  }
  const names = await workspaceDependencyClosure(direct);
  manifest.devDependencies ??= {};
  for (const name of names) {
    if (manifest.dependencies?.[name] !== undefined) manifest.dependencies[name] = `link:${name}`;
    else manifest.devDependencies[name] = `link:${name}`;
  }
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return names;
}

async function workspaceDependencyClosure(direct: ReadonlySet<string>): Promise<string[]> {
  const names = new Set(direct);
  const pending = [...direct];
  while (pending.length > 0) {
    const name = pending.pop()!;
    const manifest = JSON.parse(
      await readFile(join(root, "packages", name.slice("@zsys/".length), "package.json"), "utf8"),
    ) as Manifest;
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (!dependency.startsWith("@zsys/") || names.has(dependency)) continue;
      names.add(dependency);
      pending.push(dependency);
    }
  }
  return [...names].sort();
}

export async function prepareWorkspaceLinks(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<GenerateCommandResult> {
  const names = await useWorkspaceDependencies(projectRoot);
  for (const name of names) {
    const result = await runCommand(
      [process.execPath, "link", "--silent"],
      join(root, "packages", name.slice("@zsys/".length)),
      signal,
    );
    if (result.exitCode !== 0) return result;
  }
  return { exitCode: 0 };
}

async function runLocalCommand(
  command: readonly string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<GenerateCommandResult> {
  if (command[0] === process.execPath && command[1] === "install") {
    const prepared = await prepareWorkspaceLinks(cwd, signal);
    if (prepared.exitCode !== 0) return prepared;
  }
  const actual = command[0] === cli ? [process.execPath, ...command] : command;
  return runCommand(actual, cwd, signal);
}

async function runCommand(
  command: readonly string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<GenerateCommandResult> {
  const child = Bun.spawn([...command], { cwd, stdout: "pipe", stderr: "pipe" });
  const abort = () => child.kill();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { exitCode, stdout, stderr };
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

async function generateLocalProject(options: unknown, context: CliCommandContext) {
  return generateProject(options as CreateOptions, {
    signal: context.signal,
    bunExecutable: process.execPath,
    zsysExecutable: cli,
    commandRunner: runLocalCommand,
  });
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  return runCli(argv, {
    loadCreateZsys: async () => ({
      normalizeCreateOptions,
      generateProject: generateLocalProject,
    }),
  });
}

if (import.meta.main) process.exitCode = await main();
