import type { ExpectedClientIdentity } from "@relkit/contracts";
import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import { JobWatchAbortedError, type JobWatchOptions } from "./types.js";
import { timedCall } from "./read-timeout.js";
import { closeIterator, newEpoch } from "./reconcile-support.js";

type Procedure = (...args: readonly unknown[]) => unknown;
export interface WatchRequest {
  readonly runId: string;
  readonly after?: string;
  readonly expectedIdentity?: ExpectedClientIdentity;
}
export function watchRequest(options: JobWatchOptions, after = options.after): WatchRequest {
  return {
    runId: options.runId,
    ...(after === undefined ? {} : { after }),
    ...(options.expectedIdentity === undefined
      ? {}
      : { expectedIdentity: options.expectedIdentity }),
  };
}
export function resolveJobProcedure(root: unknown, name: string, operation: string): Procedure {
  const value = descend(root, ["jobs", name, "runs", operation]);
  if (typeof value !== "function") {
    throw new TypeError(`Unknown Relkit job procedure "jobs.${name}.runs.${operation}"`);
  }
  return value as Procedure;
}
export function ownJobProcedure(
  root: unknown,
  name: string,
  operation: string,
): Procedure | undefined {
  let value: unknown = root;
  for (const key of ["jobs", name, "runs", operation]) {
    if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    value = value[key];
  }
  return typeof value === "function" ? (value as Procedure) : undefined;
}
export async function readFirstWatchFrame(
  client: unknown,
  name: string,
  request: WatchRequest,
  signal: AbortSignal,
  timeoutMs = 10_000,
): Promise<RunWatchFrame | undefined> {
  throwIfAborted(signal);
  const iterator = await openWatchIterator(client, name, request, signal, timeoutMs);
  try {
    const result = await timedCall(signal, timeoutMs, () => iterator.next());
    throwIfAborted(signal);
    return result.done === true ? undefined : asWatchFrame(result.value);
  } finally {
    await closeIterator(iterator);
  }
}

export async function openWatchIterator(
  client: unknown,
  name: string,
  request: WatchRequest,
  signal: AbortSignal,
  timeoutMs = 10_000,
): Promise<AsyncIterator<unknown>> {
  throwIfAborted(signal);
  const call = resolveJobProcedure(client, name, "watch");
  const value = await timedCall(signal, timeoutMs, (readSignal) =>
    call(request, { signal: readSignal }),
  );
  throwIfAborted(signal);
  return toAsyncIterator(value);
}

export async function authoritativeFrame(
  client: unknown,
  name: string,
  options: JobWatchOptions,
  signal: AbortSignal,
): Promise<RunWatchFrame | undefined> {
  const get = ownJobProcedure(client, name, "get") ?? optionalJobProcedure(client, name, "get");
  if (get === undefined) {
    return readFirstWatchFrame(client, name, watchRequest(options), signal, options.readTimeoutMs);
  }
  try {
    throwIfAborted(signal);
    const run = await timedCall(signal, options.readTimeoutMs ?? 10_000, (readSignal) =>
      get(
        {
          runId: options.runId,
          ...(options.expectedIdentity === undefined
            ? {}
            : { expectedIdentity: options.expectedIdentity }),
        },
        { signal: readSignal },
      ),
    );
    throwIfAborted(signal);
    if (!isRunSnapshot(run)) throw new TypeError("Job get returned an invalid run snapshot.");
    return frameFromRun(run);
  } catch (error) {
    if (!isProcedureNotFound(error)) throw error;
    return readFirstWatchFrame(client, name, watchRequest(options), signal, options.readTimeoutMs);
  }
}

export function frameFromRun(run: RunSnapshot): RunWatchFrame {
  return Object.freeze({
    kind: "snapshot",
    run,
    observedAt: run.observedAt,
    epoch: newEpoch(),
    sequence: 0,
    continuity: "state",
  });
}

export { closeIterator, newEpoch } from "./reconcile-support.js";

function descend(root: unknown, path: readonly string[]): unknown {
  let value = root;
  for (const key of path) {
    if (!isRecord(value)) return undefined;
    value = value[key];
    if (value === undefined) return undefined;
  }
  return value;
}

function optionalJobProcedure(
  root: unknown,
  name: string,
  operation: string,
): Procedure | undefined {
  try {
    return resolveJobProcedure(root, name, operation);
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith("Unknown Relkit job procedure"))
      return undefined;
    throw error;
  }
}

function isProcedureNotFound(value: unknown): boolean {
  return isRecord(value) && value.code === "NOT_FOUND";
}

function toAsyncIterator(value: unknown): AsyncIterator<unknown> {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    const candidate = value as {
      readonly [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
      readonly next?: (...args: readonly unknown[]) => Promise<IteratorResult<unknown>>;
    };
    const asyncIterator = candidate[Symbol.asyncIterator];
    if (typeof asyncIterator === "function") return asyncIterator();
    if (typeof candidate.next === "function") return candidate as AsyncIterator<unknown>;
  }
  throw new TypeError("Job watch procedure did not return an async iterator.");
}

function asWatchFrame(value: unknown): RunWatchFrame {
  if (!isRecord(value) || typeof value.kind !== "string" || !isRecord(value.run)) {
    throw new TypeError("Job watch returned an invalid observation frame.");
  }
  return value as unknown as RunWatchFrame;
}

function isRunSnapshot(value: unknown): value is RunSnapshot {
  return isRecord(value) && typeof value.runId === "string" && typeof value.status === "string";
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new JobWatchAbortedError();
}

function isRecord(value: unknown): value is Record<string | symbol, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
