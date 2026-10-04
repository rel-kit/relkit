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

/** Runs unchanged suites with one Vitest worker and serial Bun runner groups.
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
  const bunFiles = files.filter((_, index) => !importsVitest[index]);
  const cliFiles = bunFiles.filter((file) => file.startsWith("packages/cli/"));
  const otherFiles = bunFiles.filter((file) => !file.startsWith("packages/cli/"));
  console.log(
    `Running ${vitestFiles.length} Vitest and ${bunFiles.length} Bun package test files.`,
  );
  const testEnvironment = {
    ...environment,
    RELKIT_AWS_INTEGRATION: "0",
    RELKIT_MCP_INSPECTOR_CLI: "0",
    RELKIT_TEST_DOCKER: "0",
  };
  if (vitestFiles.length > 0)
    await runTests(
      [
        process.execPath,
        "x",
        "vitest",
        "run",
        "--maxWorkers=1",
        "--disableConsoleIntercept",
        ...vitestFiles,
      ],
      testEnvironment,
    );
  for (const group of [cliFiles, otherFiles])
    if (group.length > 0)
      await runTests([process.execPath, "test", "--reporter=dot", ...group], testEnvironment);
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
