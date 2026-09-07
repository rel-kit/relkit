import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyScaffoldPlan,
  generateProject,
  type CreateOptions,
  type GenerateCommandResult,
} from "create-relkit";
import { runCli } from "./main.js";
import { loadCreateRelkit, type CliCommandContext } from "./main-support.js";
import { workspacePackageRoots } from "./local-workspaces.js";

const root = resolve(import.meta.dir, "../../..");
const cli = fileURLToPath(import.meta.url);

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
      if (!name.startsWith("@relkit/")) continue;
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
  const paths = await workspacePackageRoots(root);
  const names = new Set(direct);
  const pending = [...direct];
  while (pending.length > 0) {
    const name = pending.pop()!;
    const manifest = JSON.parse(
      await readFile(join(paths.get(name) ?? missingWorkspace(name), "package.json"), "utf8"),
    ) as Manifest;
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (!dependency.startsWith("@relkit/") || names.has(dependency)) continue;
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
  const paths = await workspacePackageRoots(root);
  for (const name of names) {
    const result = await runCommand(
      [process.execPath, "link", "--silent"],
      paths.get(name) ?? missingWorkspace(name),
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
    ...context,
    signal: context.signal,
    bunExecutable: process.execPath,
    relkitExecutable: cli,
    commandRunner: runLocalCommand,
    ...(context.onProgress === undefined ? {} : { onProgress: context.onProgress }),
  });
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const dev = argv.find((argument) => !argument.startsWith("-")) === "dev";
  return runCli(argv, {
    ...(dev
      ? {
          io: {
            stdout: (line: string) => process.stdout.write(`${line}\n`),
            stderr: (line: string) => {
              if (!line.startsWith("RELKIT_INTERRUPTED:")) process.stderr.write(`${line}\n`);
            },
          },
        }
      : {}),
    loadCreateRelkit: async () => ({
      ...(await loadCreateRelkit()),
      generateProject: generateLocalProject,
      applyScaffoldPlan: (plan, context) =>
        applyScaffoldPlan(plan, {
          ...context,
          bunExecutable: process.execPath,
          relkitExecutable: cli,
          commandRunner: runLocalCommand,
        }),
    }),
  });
}

if (import.meta.main) process.exitCode = await main();

function missingWorkspace(name: string): never {
  throw new Error(`Workspace package not found: ${name}`);
}
