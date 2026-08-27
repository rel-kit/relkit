import { access } from "node:fs/promises";
import { join } from "node:path";
import { CreateValidationError } from "./validate.js";
import {
  GenerateProjectError,
  type GenerateCommandResult,
  type GenerateFailurePoint,
  type GenerateProjectContext,
} from "./generate.js";
import type { StageCleanupResult } from "./generate-files.js";

export function generationError(
  error: unknown,
  fallback: string,
  cleanup?: StageCleanupResult,
): GenerateProjectError {
  let failure: GenerateProjectError;
  if (error instanceof GenerateProjectError) failure = error;
  else if (error instanceof CreateValidationError)
    failure = new GenerateProjectError(error.code, error.message);
  else if (error instanceof Error && typeof (error as { code?: unknown }).code === "string")
    failure = new GenerateProjectError(
      (error as unknown as { readonly code: string }).code,
      error.message,
    );
  else
    failure = new GenerateProjectError(
      fallback,
      error instanceof Error ? error.message : String(error),
    );

  if (cleanup?.temporaryPath === undefined) return failure;
  const state = cleanup.removed ? "cleaned" : "retained";
  return new GenerateProjectError(
    failure.code,
    `${failure.message} Temporary directory ${state}: ${cleanup.temporaryPath}.`,
    cleanup.temporaryPath,
  );
}

export function injectGenerateFailure(
  context: GenerateProjectContext,
  point: GenerateFailurePoint,
): void {
  try {
    context.failAt?.(point);
  } catch (error) {
    if (error instanceof GenerateProjectError) throw error;
    throw new GenerateProjectError(
      `RELKIT_CREATE_${point.toUpperCase()}_FAILED`,
      error instanceof Error ? error.message : `Injected ${point} failure.`,
    );
  }
}

export async function runProjectStep(
  context: GenerateProjectContext,
  command: readonly string[],
  cwd: string,
  step: string,
  point: GenerateFailurePoint,
): Promise<void> {
  throwIfAborted(context.signal);
  injectGenerateFailure(context, point);
  const result = await (context.commandRunner ?? runProjectCommand)(command, cwd, context.signal);
  throwIfAborted(context.signal);
  if (result.exitCode !== 0) {
    const output = result.stderr?.trim() || result.stdout?.trim();
    throw new GenerateProjectError(
      `RELKIT_CREATE_${step.toUpperCase()}_FAILED`,
      `${step} failed with exit code ${result.exitCode}.${output ? `\n${output}` : ""}`,
    );
  }
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw (
      signal.reason ?? new GenerateProjectError("RELKIT_INTERRUPTED", "Generation was interrupted.")
    );
}

export async function resolveRelkitExecutable(
  context: GenerateProjectContext,
  root: string,
): Promise<string> {
  if (context.relkitExecutable !== undefined) return context.relkitExecutable;
  if (context.commandRunner !== undefined) return "relkit";
  for (const candidate of [join(root, "node_modules/.bin/relkit"), Bun.which("relkit")]) {
    if (candidate === null || candidate === undefined) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new GenerateProjectError(
    "RELKIT_CREATE_CLI_UNAVAILABLE",
    "The relkit CLI is not available for project checks.",
  );
}

export async function runProjectCommand(
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
