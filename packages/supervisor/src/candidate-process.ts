import { rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { CandidateLogEvent, CandidateLogger, CandidateOptions } from "./candidate.types.js";
import { validateSupervisorToken } from "./state-machine-telemetry.js";
import type { SupervisorCandidateToken } from "./state-machine.types.js";
import type { CandidateDirectory } from "./candidate-service.types.js";
export { captureOutput } from "./candidate-output.js";

/** Computes validated exclusive generation paths. @param options - Native candidate configuration.
 * @returns Paths without acquiring filesystem resources. */
export function candidateContext(options: CandidateOptions): CandidateDirectory {
  validateSupervisorToken(options.token);
  const projectRoot = resolve(options.projectRoot);
  const directoryRoot = resolve(projectRoot, options.generatedDirectory ?? ".relkit/generated");
  const directory = join(directoryRoot, `generation-${options.token.generationToken}`);
  return { projectRoot, directoryRoot, directory };
}

/** Admits a compiled entrypoint below its generation directory. @param directory - Owned directory.
 * @param entrypoint - Compiler-selected path. @returns Validated absolute entrypoint. */
export function entrypointIn(directory: string, entrypoint: string): string {
  if (typeof entrypoint !== "string" || entrypoint.trim() === "")
    throw new TypeError("Candidate compilation must return an entrypoint.");
  const resolved = resolve(directory, entrypoint);
  if (!isWithin(directory, resolved) || resolved === directory)
    throw new Error("Candidate entrypoint must remain inside its generation directory.");
  return resolved;
}

/** Allocates/adopts a private native port. @param options - Explicit port/allocator precedence.
 * @param hostname - Native listener host. @returns Port after the temporary allocator listener stops. */
export async function resolvePort(options: CandidateOptions, hostname: string): Promise<number> {
  const port =
    options.port === undefined || options.port === 0
      ? await (options.allocatePort ?? allocatePort)(hostname)
      : options.port;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535)
    throw new RangeError("Candidate backend port must be between 1 and 65535.");
  return port;
}

/** Projects inherited/native child environment. @param values - Explicit overrides.
 * @param token - Candidate identity. @param port - Private listener port. @returns Existing child environment shape. */
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

/** Shares actual native process termination. @param child - Owned Bun process.
 * @param timeoutMs - Graceful termination bound. @returns Idempotent native stop callback. */
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

/** Stops the actual child, using SIGKILL after its native grace period. @param child - Owned process.
 * @param timeoutMs - SIGTERM deadline. @returns Completion only after actual native exit; clears its native timer. */
export async function terminate(child: Bun.ReadableSubprocess, timeoutMs: number): Promise<void> {
  if (child.exitCode === null) child.kill("SIGTERM");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const exited = await Promise.race([
    child.exited.then(() => true),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await child.exited;
  }
}

/** Removes only the owned generation subtree. @param directory - Exclusive generation directory.
 * @param root - Generated directory authority. @returns Native filesystem settlement. */
export async function cleanupCandidate(directory: string, root: string): Promise<void> {
  if (!isWithin(root, directory) || directory === root)
    throw new Error("Candidate cleanup path must remain below its generated directory.");
  await rm(directory, { recursive: true, force: true });
}

/** Adapts a native candidate failure to the established bounded sink. @param options - Native logger.
 * @param event - Existing failure label. @param directory - Owned generation. @param error - Original failure.
 * @returns After the isolated sink callback. */
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

/** Isolates native lifecycle sink failures. @param logger - Existing callback sink. @param event - Native evidence.
 * @returns After publication or an isolated sink failure. */
export function emit(logger: CandidateLogger | undefined, event: CandidateLogEvent): void {
  try {
    logger?.(Object.freeze({ ...event, token: Object.freeze({ ...event.token }) }));
  } catch {
    // Logging failures must not change candidate lifecycle behavior.
  }
}

/** Preserves caller abort-reason identity. @param signal - Caller-owned cancellation authority.
 * @returns When the caller is active. @throws The original reason when already aborted. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new Error("Candidate operation was aborted.");
}

/** Validates native resource limits. @param value - Requested budget. @param name - Compatibility field label.
 * @param allowZero - Whether zero is admitted. @returns When the requested limit is valid.
 * @throws RangeError for an invalid budget. */
export function validateBound(value: number, name: string, allowZero: boolean): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1))
    throw new RangeError(`${name} must be ${allowZero ? "non-negative" : "positive"}.`);
}

/** Checks a native path boundary. @param root - Owning directory. @param candidate - Requested path.
 * @returns Whether the path remains below or equal to root. */
function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

/** Acquires and stops a temporary Bun listener. @param hostname - Listener host.
 * @returns Native ephemeral port after listener shutdown. */
async function allocatePort(hostname: string): Promise<number> {
  const server = Bun.serve({ hostname, port: 0, fetch: () => new Response() });
  const port = server.port;
  await server.stop(true);
  if (port === undefined) throw new Error("Bun did not allocate a candidate backend port.");
  return port;
}

/** Projects native diagnostic detail. @param error - Original failure. @returns Existing message/string conversion. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
