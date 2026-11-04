/**
 * Runs the project's type checker as a parallel watch process for the length of a
 * `relkit dev` session. Reloads never wait for it: the warm check skips type-checking, and
 * this process reports each finished pass through the session log, which the terminal
 * prints and the Inspector receives as a log record (`dev.typecheck.failed` with the
 * diagnostics and their source locations, or `dev.typecheck.passed`). It prefers `tsgo`
 * when the project installs it, falls back to `typescript/bin/tsc`, and reports
 * `dev.typecheck.unavailable` when neither or no `tsconfig.json` is present. The Scope that
 * acquired it stops the process.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { cleanupEffect } from "../services/cleanup.service.js";
import { cliTry } from "../cli-errors.js";
import { parseTypecheckLine } from "./typecheck-output.js";
import type { DevLog } from "../commands/dev.types.js";
import type { TypecheckDiagnostic } from "./typecheck-output.types.js";

/** Diagnostics included in one log record; the count is always complete. */
const REPORTED_DIAGNOSTICS = 20;

/**
 * Starts the watch process in the caller's Scope.
 * @param projectRoot - Application root containing `tsconfig.json`.
 * @param log - Session log, shared with the terminal and the Inspector.
 * @returns Acquisition; Scope release stops the process.
 */
export const acquireTypecheckWatch = Effect.fn("Dev.typecheckWatch")(function* (
  projectRoot: string,
  log: DevLog,
) {
  const command = typecheckCommand(projectRoot);
  if (command === undefined) {
    log({ level: "warn", event: "dev.typecheck.unavailable", fields: { projectRoot } });
    return;
  }
  yield* Effect.acquireRelease(
    cliTry("dev.typecheck.spawn", () => startWatch(projectRoot, command, log)),
    (child) =>
      cleanupEffect(
        "dev.typecheck.stop",
        cliTry("dev.typecheck.kill", () => child.kill("SIGTERM")).pipe(
          Effect.andThen(Effect.promise(() => child.exited)),
        ),
      ),
  );
});

/**
 * Chooses the project's checker binary.
 * @param projectRoot - Application root.
 * @returns Command line, or undefined when no checker or config exists.
 */
function typecheckCommand(projectRoot: string): readonly string[] | undefined {
  const config = join(projectRoot, "tsconfig.json");
  if (!existsSync(config)) return undefined;
  const flags = ["--watch", "--noEmit", "--pretty", "false", "--preserveWatchOutput", "-p", config];
  const tsgo = join(projectRoot, "node_modules/.bin/tsgo");
  if (existsSync(tsgo)) return [tsgo, ...flags];
  try {
    return [process.execPath, Bun.resolveSync("typescript/bin/tsc", projectRoot), ...flags];
  } catch {
    return undefined;
  }
}

/**
 * Spawns the checker and reports each completed pass.
 * @param projectRoot - Working directory.
 * @param command - Checker command line.
 * @param log - Session log.
 * @returns The running process.
 */
function startWatch(projectRoot: string, command: readonly string[], log: DevLog) {
  const child = Bun.spawn([...command], {
    cwd: projectRoot,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
    env: { ...process.env, NO_COLOR: "1" },
  });
  let pass: TypecheckDiagnostic[] = [];
  let buffer = "";
  const decoder = new TextDecoder();
  void (async () => {
    for await (const chunk of child.stdout) {
      buffer += decoder.decode(chunk);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const parsed = parseTypecheckLine(line, projectRoot);
        if (parsed.kind === "diagnostic") pass.push(parsed.diagnostic);
        if (parsed.kind === "started") pass = [];
        if (parsed.kind === "finished") {
          report(log, pass, parsed.errors);
          pass = [];
        }
      }
    }
  })().catch(() => undefined);
  return child;
}

/**
 * Logs one finished pass.
 * @param log - Session log.
 * @param diagnostics - Diagnostics of the pass.
 * @param errors - Error count reported by the checker.
 */
function report(log: DevLog, diagnostics: readonly TypecheckDiagnostic[], errors: number): void {
  if (errors === 0) {
    log({ level: "info", event: "dev.typecheck.passed", fields: { errors: 0 } });
    return;
  }
  log({
    level: "warn",
    event: "dev.typecheck.failed",
    fields: {
      errors,
      diagnostics: diagnostics.slice(0, REPORTED_DIAGNOSTICS).map((entry) => ({ ...entry })),
    },
  });
}
