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
  console.log(`Running ${files.length} package and integration test files.`);
  const child = Bun.spawn([process.execPath, "test", "--reporter=dot", ...files], {
    cwd: root,
    env: {
      ...environment,
      RELKIT_AWS_INTEGRATION: "0",
      RELKIT_MCP_INSPECTOR_CLI: "0",
      RELKIT_TEST_DOCKER: "0",
    },
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
