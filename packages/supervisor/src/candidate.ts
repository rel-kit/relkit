import { access, mkdir } from "node:fs/promises";
import {
  candidateContext,
  captureOutput,
  childEnvironment,
  cleanupCandidate,
  createStopper,
  emit,
  emitFailure,
  entrypointIn,
  resolvePort,
  terminate,
  throwIfAborted,
  validateBound,
} from "./candidate-process.js";
import type { CandidateOptions, CompiledCandidate, StartedCandidate } from "./candidate-types.js";

export type {
  CandidateCompile,
  CandidateCompileRequest,
  CandidateCompileResult,
  CandidateLogEvent,
  CandidateLogger,
  CandidateOptions,
  CandidateOutput,
  CompiledCandidate,
  StartedCandidate,
} from "./candidate-types.js";

export const DEFAULT_CANDIDATE_GENERATED_DIRECTORY = ".relkit/generated";
export const DEFAULT_CANDIDATE_OUTPUT_BYTES = 8 * 1024;
export const DEFAULT_CANDIDATE_STOP_TIMEOUT_MS = 1_000;

/** Compiles one token into an exclusive generation directory. */
export async function compileCandidate(options: CandidateOptions): Promise<CompiledCandidate> {
  const context = candidateContext(options);
  await mkdir(context.directoryRoot, { recursive: true });
  await mkdir(context.directory);
  emit(options.logger, {
    level: "info",
    event: "candidate.compile.started",
    token: options.token,
    directory: context.directory,
  });
  try {
    throwIfAborted(options.signal);
    const result = await options.compile({
      token: options.token,
      projectRoot: context.projectRoot,
      outputDirectory: context.directory,
      signal: options.signal ?? new AbortController().signal,
    });
    throwIfAborted(options.signal);
    const entrypoint = entrypointIn(context.directory, result.entrypoint);
    await access(entrypoint);
    emit(options.logger, {
      level: "info",
      event: "candidate.compile.succeeded",
      token: options.token,
      directory: context.directory,
      fields: { entrypoint },
    });
    return Object.freeze({
      token: options.token,
      directory: context.directory,
      entrypoint,
      ...(result.environment === undefined ? {} : { environment: result.environment }),
      cleanup: () => cleanupCandidate(context.directory, context.directoryRoot),
    });
  } catch (error) {
    emitFailure(options, "candidate.compile.failed", context.directory, error);
    await cleanupCandidate(context.directory, context.directoryRoot).catch(() => undefined);
    throw error;
  }
}

/** Compiles and starts one Bun backend without changing any active generation. */
export async function startCandidate(options: CandidateOptions): Promise<StartedCandidate> {
  const maxOutputBytes = options.maxStartupOutputBytes ?? DEFAULT_CANDIDATE_OUTPUT_BYTES;
  const stopTimeoutMs = options.stopTimeoutMs ?? DEFAULT_CANDIDATE_STOP_TIMEOUT_MS;
  validateBound(maxOutputBytes, "maxStartupOutputBytes", false);
  validateBound(stopTimeoutMs, "stopTimeoutMs", true);
  const compiled = await compileCandidate(options);
  const hostname = options.hostname ?? "127.0.0.1";
  let child: Bun.ReadableSubprocess | undefined;
  try {
    throwIfAborted(options.signal);
    const port = await resolvePort(options, hostname);
    const environment = childEnvironment(
      { ...options.environment, ...compiled.environment },
      options.token,
      port,
    );
    emit(options.logger, {
      level: "info",
      event: "candidate.start.started",
      token: options.token,
      directory: compiled.directory,
      fields: { port },
    });
    child = Bun.spawn<"ignore", "pipe", "pipe">(
      [process.execPath, "run", "--no-env-file", "--no-install", "--silent", compiled.entrypoint],
      {
        cwd: options.projectRoot,
        env: environment,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );
    const output = captureOutput(
      child,
      options.logger,
      options.token,
      compiled.directory,
      maxOutputBytes,
    );
    const exited = child.exited;
    void exited.then((exitCode) =>
      emit(options.logger, {
        level: exitCode === 0 ? "info" : "error",
        event: "candidate.process-exited",
        token: options.token,
        directory: compiled.directory,
        fields: { exitCode },
      }),
    );
    const stop = createStopper(child, stopTimeoutMs);
    const dispose = async (): Promise<void> => {
      await stop();
      await compiled.cleanup();
    };
    emit(options.logger, {
      level: "info",
      event: "candidate.start.succeeded",
      token: options.token,
      directory: compiled.directory,
      fields: { port, pid: child.pid },
    });
    return Object.freeze({
      ...compiled,
      port,
      pid: child.pid,
      process: child,
      exited,
      output,
      stop,
      dispose,
    });
  } catch (error) {
    if (child !== undefined) await terminate(child, stopTimeoutMs);
    emitFailure(options, "candidate.start.failed", compiled.directory, error);
    await compiled.cleanup().catch(() => undefined);
    throw error;
  }
}
