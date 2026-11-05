/**
 * The application's own TypeScript compiler, run as a separate process. `relkit check` and the
 * `relkit dev` watch both use it, so the application's TypeScript version (5.9's `tsc`, 7's
 * native `tsc`, or `tsgo` from `@typescript/native-preview`) decides every type error and RelKit
 * never loads the application's compiler API in-process.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { runtime } from "../runtime/index.js";
import { parseCompilerOutput } from "./typescript-compiler-output.js";
import type { CompilerRun } from "./typescript-compiler.types.js";
export type { CompilerOutputDiagnostic, CompilerRun } from "./typescript-compiler.types.js";

/**
 * Finds the project's compiler executable.
 * @param projectRoot - Application root; resolution walks up from it like an import would.
 * @returns The command that starts the compiler without arguments, or undefined when the project
 * installs neither `@typescript/native-preview` nor `typescript`.
 * @remarks TypeScript 7's package `exports` hide `typescript/bin/tsc`, so the executable is read
 * from the exported `package.json` instead of resolved as a module.
 */
export function projectCompilerCommand(projectRoot: string): readonly string[] | undefined {
  const tsgo = join(projectRoot, "node_modules/.bin/tsgo");
  if (existsSync(tsgo)) return [tsgo];
  for (const [name, bin] of [
    ["@typescript/native-preview", "tsgo"],
    ["typescript", "tsc"],
  ] as const) {
    const executable = packageExecutable(projectRoot, name, bin);
    // Both packages ship JavaScript launchers, which run on the CLI's own runtime.
    if (executable !== undefined) return [process.execPath, executable];
  }
  return undefined;
}

/**
 * Resolves one package's declared executable.
 * @param projectRoot - Resolution start.
 * @param name - Package name.
 * @param bin - Executable name in the package's `bin` map.
 * @returns Absolute executable path, or undefined when the package or executable is absent.
 */
function packageExecutable(projectRoot: string, name: string, bin: string): string | undefined {
  try {
    const manifestPath = runtime.modules.resolve(`${name}/package.json`, projectRoot);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      readonly bin?: string | Readonly<Record<string, string>>;
    };
    const entry = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[bin];
    if (entry === undefined) return undefined;
    const executable = join(dirname(manifestPath), entry);
    return existsSync(executable) ? executable : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Type-checks one configuration with the project's compiler and parses its diagnostics.
 * @param projectRoot - Working directory; reported paths are relative to it.
 * @param configPath - `tsconfig.json` (or a generated wrapper) passed with `-p`.
 * @returns The compiler's diagnostics, or why it could not run.
 */
export const runProjectCompilerEffect = Effect.fn("Compiler.runProjectCompiler")(function* (
  projectRoot: string,
  configPath: string,
) {
  const command = projectCompilerCommand(projectRoot);
  if (command === undefined) return { kind: "unavailable" } satisfies CompilerRun;
  return yield* Effect.promise(async (): Promise<CompilerRun> => {
    try {
      const child = runtime.processes.spawn(
        [...command, "-p", configPath, "--noEmit", "--pretty", "false"],
        {
          cwd: projectRoot,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      const diagnostics = parseCompilerOutput(stdout);
      // tsc exits 1 or 2 when it reported diagnostics; anything else is a failure to run.
      if (exitCode !== 0 && diagnostics.length === 0)
        return { kind: "failed", exitCode, output: `${stdout}${stderr}`.trim() };
      return { kind: "checked", diagnostics };
    } catch (cause) {
      return { kind: "failed", exitCode: -1, output: String(cause) };
    }
  });
});
