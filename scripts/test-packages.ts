import { relative, resolve } from "node:path";
import { workspacePackageDirectories } from "./workspace-packages.js";

const root = resolve(import.meta.dir, "..");

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

export async function runPackageTests(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const files = packageTestFiles(root);
  if (files.length === 0) throw new Error("No package tests were discovered.");
  const importsVitest = await Promise.all(
    files.map(async (file) =>
      /from ["']vitest["']/.test(await Bun.file(resolve(root, file)).text()),
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
    await runTests([process.execPath, "x", "vitest", "run", ...vitestFiles], testEnvironment);
  const runs = [cliFiles, otherFiles]
    .filter((group) => group.length > 0)
    .map((group) =>
      runTests([process.execPath, "test", "--reporter=dot", ...group], testEnvironment),
    );
  const results = await Promise.allSettled(runs);
  for (const result of results) if (result.status === "rejected") throw result.reason;
}

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
