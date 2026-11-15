/**
 * Runs the type fixtures with the workspace compiler, then the editor assertions: what an editor
 * suggests and reports in the authoring APIs, on TypeScript 5.9's language service and on
 * TypeScript 7's language server.
 */
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

/** Runs one step from the repository root and fails with its name when it does not exit 0. */
async function step(name: string, command: readonly string[]): Promise<void> {
  const child = Bun.spawn([...command], { cwd: root, stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${name} failed with exit code ${exitCode}`);
}

await step("Type fixtures", [
  process.execPath,
  "x",
  "tsc",
  "-p",
  "tests/types/tsconfig.json",
  "--pretty",
  "false",
]);
console.log("Type fixtures passed (public descriptor inference and boundary rejection).");

await step("Editor assertions", [process.execPath, "test", "./tests/editor"]);
console.log("Editor assertions passed (suggestions and errors in the authoring APIs).");
