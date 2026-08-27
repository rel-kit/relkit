import { rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { CandidateLogEvent, CandidateLogger, CandidateOptions } from "./candidate-types.js";
import { validateSupervisorToken } from "./state-machine-telemetry.js";
import type { SupervisorCandidateToken } from "./state-machine-types.js";
export { captureOutput } from "./candidate-output.js";

export function candidateContext(options: CandidateOptions): {
  readonly projectRoot: string;
  readonly directoryRoot: string;
  readonly directory: string;
} {
  validateSupervisorToken(options.token);
  const projectRoot = resolve(options.projectRoot);
  const directoryRoot = resolve(projectRoot, options.generatedDirectory ?? ".relkit/generated");
  const directory = join(directoryRoot, `generation-${options.token.generationToken}`);
  return { projectRoot, directoryRoot, directory };
}

export function entrypointIn(directory: string, entrypoint: string): string {
  if (typeof entrypoint !== "string" || entrypoint.trim() === "")
    throw new TypeError("Candidate compilation must return an entrypoint.");
  const resolved = resolve(directory, entrypoint);
  if (!isWithin(directory, resolved) || resolved === directory)
    throw new Error("Candidate entrypoint must remain inside its generation directory.");
  return resolved;
}

export async function resolvePort(options: CandidateOptions, hostname: string): Promise<number> {
  const port =
    options.port === undefined || options.port === 0
      ? await (options.allocatePort ?? allocatePort)(hostname)
      : options.port;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535)
    throw new RangeError("Candidate backend port must be between 1 and 65535.");
  return port;
}

export function childEnvironment(
  values: Readonly<Record<string, string | undefined>> | undefined,
  token: SupervisorCandidateToken,
  port: number,
): Record<string, string> {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  return {
    ...inherited,
    ...Object.fromEntries(
      Object.entries(values ?? {}).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    PORT: String(port),
    RELKIT_SOURCE_TOKEN: String(token.sourceToken),
    RELKIT_GENERATION_TOKEN: String(token.generationToken),
  };
}

export function createStopper(
  child: Bun.ReadableSubprocess,
  timeoutMs: number,
): () => Promise<void> {
  let stopping: Promise<void> | undefined;
  return () => {
    stopping ??= terminate(child, timeoutMs);
    return stopping;
  };
}

export async function terminate(child: Bun.ReadableSubprocess, timeoutMs: number): Promise<void> {
  if (child.exitCode === null) child.kill("SIGTERM");
  const exited = await Promise.race([
    child.exited.then(() => true),
    delay(timeoutMs).then(() => false),
  ]);
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await child.exited;
  }
}

export async function cleanupCandidate(directory: string, root: string): Promise<void> {
  if (!isWithin(root, directory) || directory === root)
    throw new Error("Candidate cleanup path must remain below its generated directory.");
  await rm(directory, { recursive: true, force: true });
}

export function emitFailure(
  options: CandidateOptions,
  event: "candidate.compile.failed" | "candidate.start.failed",
  directory: string,
  error: unknown,
): void {
  emit(options.logger, {
    level: "error",
    event,
    token: options.token,
    directory,
    fields: { message: errorMessage(error).slice(0, 512) },
  });
}

export function emit(logger: CandidateLogger | undefined, event: CandidateLogEvent): void {
  try {
    logger?.(Object.freeze({ ...event, token: Object.freeze({ ...event.token }) }));
  } catch {
    // Logging failures must not change candidate lifecycle behavior.
  }
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new Error("Candidate operation was aborted.");
}

export function validateBound(value: number, name: string, allowZero: boolean): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1))
    throw new RangeError(`${name} must be ${allowZero ? "non-negative" : "positive"}.`);
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

async function allocatePort(hostname: string): Promise<number> {
  const server = Bun.serve({ hostname, port: 0, fetch: () => new Response() });
  const port = server.port;
  await server.stop(true);
  if (port === undefined) throw new Error("Bun did not allocate a candidate backend port.");
  return port;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
