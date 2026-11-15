/**
 * Step runner and project context of the Node creation smoke: each acceptance step has a name, a
 * duration and, when it fails, the failing command's output in the error.
 */
import { runCaptured, type Finished } from "./node-creation-process.js";

/** The project under test and the environment its commands run in. */
export interface Project {
  readonly manager: "npm" | "pnpm";
  readonly directory: string;
  /** Environment of every command; the run checked up front that `bun` is not on its PATH. */
  readonly env: NodeJS.ProcessEnv;
}

/** One finished step. */
export interface StepResult {
  readonly name: string;
  readonly ms: number;
  readonly ok: boolean;
}

/** A step that failed; the message holds the reason and the output that explains it. */
export class StepFailure extends Error {
  constructor(
    readonly step: string,
    reason: string,
  ) {
    super(`Step "${step}" failed: ${reason}`);
  }
}

/** Longest output tail quoted in a failure. */
const TAIL = 6_000;

/**
 * Runs one named step and records its duration.
 * @param results - Collector of finished steps.
 * @param name - Step name shown in the log, the summary and any failure.
 * @param body - The step; a thrown error fails it.
 * @returns What the step returned.
 */
export async function step<T>(
  results: StepResult[],
  name: string,
  body: () => Promise<T>,
): Promise<T> {
  console.log(`\n=== step: ${name}`);
  const started = Date.now();
  try {
    const value = await body();
    results.push({ name, ms: Date.now() - started, ok: true });
    console.log(`=== ok: ${name} (${seconds(Date.now() - started)})`);
    return value;
  } catch (cause) {
    results.push({ name, ms: Date.now() - started, ok: false });
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw cause instanceof StepFailure ? cause : new StepFailure(name, reason);
  }
}

/** @param ms - Duration. @returns Seconds with one decimal. */
function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** @param results - Finished steps. @returns One line per step with its duration. */
export function summarize(results: readonly StepResult[]): string {
  return results
    .map(
      (result) =>
        `${result.ok ? "ok  " : "FAIL"} ${seconds(result.ms).padStart(7)}  ${result.name}`,
    )
    .join("\n");
}

/**
 * Throws the failure of a command with the end of its output.
 * @param command - Command line, for the message.
 * @param finished - How it ended.
 * @param reason - What was expected.
 * @returns Never.
 */
export function fail(command: string, finished: Finished, reason: string): never {
  const how =
    finished.signal !== null ? `signal ${finished.signal}` : `exit status ${finished.code}`;
  throw new Error(`${reason}\n$ ${command} (${how})\n${finished.output.slice(-TAIL)}`);
}

/**
 * Package-manager command lines for the project.
 * @param project - The project.
 * @returns Builders for scripts, installs and the project's `relkit` binary.
 */
export function commands(project: Project) {
  const pm = project.manager;
  return {
    /** @param name - package.json script. @param args - Arguments after it. */
    script: (name: string, args: readonly string[] = []) =>
      pm === "npm"
        ? ["npm", "run", name, ...(args.length > 0 ? ["--", ...args] : [])]
        : ["pnpm", "run", name, ...args],
    /** @param args - Arguments of the project's own `relkit` command. */
    relkit: (args: readonly string[]) =>
      pm === "npm" ? ["npx", "--no", "relkit", ...args] : ["pnpm", "exec", "relkit", ...args],
  };
}

/**
 * Runs a command in the project and requires exit status 0.
 * @param project - The project.
 * @param command - Executable and arguments.
 * @param env - Values added to the project's environment.
 * @returns The finished command.
 */
export async function mustSucceed(
  project: Project,
  command: readonly string[],
  env: NodeJS.ProcessEnv = {},
): Promise<Finished> {
  const finished = await runCaptured(command, project.directory, { ...project.env, ...env });
  if (finished.code !== 0) fail(command.join(" "), finished, "Expected exit status 0.");
  return finished;
}

/**
 * Runs a command in the project that is expected to fail.
 * @param project - The project.
 * @param command - Executable and arguments.
 * @param env - Values added to the project's environment.
 * @returns The finished command, with a non-zero exit status.
 */
export async function mustFail(
  project: Project,
  command: readonly string[],
  env: NodeJS.ProcessEnv = {},
): Promise<Finished> {
  const finished = await runCaptured(command, project.directory, { ...project.env, ...env });
  if (finished.code === 0) fail(command.join(" "), finished, "Expected a non-zero exit status.");
  return finished;
}

/**
 * Requires text in a command's output.
 * @param command - Command line, for the message.
 * @param finished - How it ended.
 * @param pattern - Text or pattern that must appear.
 * @param reason - What its presence proves.
 */
export function expectOutput(
  command: readonly string[],
  finished: Finished,
  pattern: RegExp | string,
  reason: string,
): void {
  const found =
    typeof pattern === "string" ? finished.output.includes(pattern) : pattern.test(finished.output);
  if (!found) fail(command.join(" "), finished, `${reason} (missing ${String(pattern)}).`);
}
