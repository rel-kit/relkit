/** Discovers package-owned suites and runs each native runner cohort sequentially with one worker. */
import { relative, resolve } from "node:path";
import { workspacePackageDirectories } from "./workspace-packages.js";

const root = resolve(import.meta.dir, "..");

/** Discovers every authored package suite without duplicate paths or generated output.
 * @param repositoryRoot - Workspace root containing publishable package directories.
 * @returns Deterministically ordered test paths relative to that root.
 */
export function packageTestFiles(repositoryRoot: string): string[] {
  const files = new Set<string>();
  for (const directory of workspacePackageDirectories(repositoryRoot))
    for (const path of new Bun.Glob("**/*.test.ts").scanSync({
      cwd: directory,
      onlyFiles: true,
    })) {
      const normalized = path.replaceAll("\\", "/");
      if (/(^|\/)(dist|node_modules|\.turbo)(\/|$)/.test(normalized)) continue;
      files.add(relative(repositoryRoot, resolve(directory, path)).replaceAll("\\", "/"));
    }
  return [...files].sort();
}

/** Runs unchanged suites with one Vitest worker and their required native runtime.
 * @param environment - Parent configuration; opt-in AWS and Docker probes remain disabled here.
 * @returns After all Vitest and Bun owners settle, rejecting any failed group.
 */
export async function runPackageTests(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const files = packageTestFiles(root);
  if (files.length === 0) throw new Error("No package tests were discovered.");
  const importsVitest = await Promise.all(
    files.map(async (file) =>
      /from ["'](?:vitest|@effect\/vitest)["']/.test(await Bun.file(resolve(root, file)).text()),
    ),
  );
  const vitestFiles = files.filter((_, index) => importsVitest[index]);
  const generatorVitestFiles = ownedFiles(vitestFiles, "packages/create-relkit/");
  const scaffoldingVitestFiles = ownedFiles(vitestFiles, "packages/cli/tests/scaffolding/");
  const nativeBunFiles = new Set([...generatorVitestFiles, ...scaffoldingVitestFiles]);
  const nodeVitestFiles = vitestFiles.filter((file) => !nativeBunFiles.has(file));
  const compilerProbeFiles = nodeVitestFiles.filter(
    (file) =>
      file.endsWith("/type-probes.test.ts") || file.endsWith("/postgres-declarations.test.ts"),
  );
  const compilerProbes = new Set(compilerProbeFiles);
  const otherNodeVitestFiles = nodeVitestFiles.filter((file) => !compilerProbes.has(file));
  const bunFiles = files.filter((_, index) => !importsVitest[index]);
  const cliFiles = bunFiles.filter((file) => file.startsWith("packages/cli/"));
  const otherFiles = bunFiles.filter((file) => !file.startsWith("packages/cli/"));
  console.log(
    `Running ${vitestFiles.length} Vitest (${nativeBunFiles.size} native Bun) and ${bunFiles.length} Bun package test files.`,
  );
  const testEnvironment = {
    ...environment,
    RELKIT_AWS_INTEGRATION: "0",
    RELKIT_MCP_INSPECTOR_CLI: "0",
    RELKIT_TEST_DOCKER: "0",
  };
  await runBunVitest(
    generatorVitestFiles,
    "packages/create-relkit/vitest.config.ts",
    testEnvironment,
  );
  await runBunVitest(
    scaffoldingVitestFiles,
    "packages/cli/vitest.scaffolding.config.ts",
    testEnvironment,
  );
  await runNodeVitest(
    [...compilerProbeFiles.map((file) => [file]), otherNodeVitestFiles],
    testEnvironment,
  );
  for (const group of [cliFiles, otherFiles])
    if (group.length > 0)
      await runTests([process.execPath, "test", "--reporter=dot", ...group], testEnvironment);
}

function ownedFiles(files: readonly string[], owner: string): string[] {
  return files.filter((file) => file.startsWith(owner));
}

async function runBunVitest(
  files: readonly string[],
  config: string,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  if (files.length === 0) return;
  await runTests(
    [
      process.execPath,
      "x",
      "--bun",
      "vitest",
      "run",
      "--config",
      config,
      "--maxWorkers=1",
      "--disableConsoleIntercept",
      ...files,
    ],
    environment,
  );
}

async function runNodeVitest(
  groups: readonly string[][],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  // Whole-program compiler probes release their heap before the next suite starts.
  for (const group of groups) {
    if (group.length === 0) continue;
    await runTests(
      [
        process.execPath,
        "x",
        "vitest",
        "run",
        "--maxWorkers=1",
        "--disableConsoleIntercept",
        ...group,
      ],
      environment,
    );
  }
}

/** Joins a native runner and retains its existing nonzero-exit failure contract.
 * @param command - Pinned executable and complete suite arguments.
 * @param environment - Explicit offline runner environment.
 * @returns After native process exit; no test assertion or deadline is changed.
 */
async function runTests(command: string[], environment: NodeJS.ProcessEnv): Promise<void> {
  const child = Bun.spawn(command, {
    cwd: root,
    env: environment,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`Package tests failed with exit code ${exitCode}.`);
}

if (import.meta.main)
  runPackageTests().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
