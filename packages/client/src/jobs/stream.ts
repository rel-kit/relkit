import type { JsonValue } from "@relkit/contracts";
import type { ExpectedClientIdentity } from "@relkit/contracts";
import type { NamedStreamFrame } from "@relkit/contracts/jobs";
import { closeIterator, resolveJobProcedure } from "./reconcile.js";
import { readWatchNext, timedCall } from "./read-timeout.js";

export interface JobStreamOptions {
  readonly runId: string;
  readonly name: string;
  readonly after?: string;
  readonly expectedIdentity?: ExpectedClientIdentity;
  readonly signal?: AbortSignal;
  readonly readTimeoutMs?: number;
  readonly maxFrames?: number;
  readonly maxBytes?: number;
  readonly maxItemBytes?: number;
}

export class JobStreamOverflowError extends Error {
  readonly code = "RELKIT_JOB_STREAM_OVERFLOW" as const;

  constructor(readonly limit: "frames" | "bytes" | "item-bytes") {
    super(`The named job stream exceeded its ${limit} bound.`);
    this.name = "JobStreamOverflowError";
  }
}

export class JobStreamGapError extends Error {
  readonly code = "RELKIT_JOB_STREAM_GAP" as const;

  constructor(
    readonly expected: number,
    readonly received: number,
  ) {
    super(`The named job stream skipped content sequence ${expected} before ${received}.`);
    this.name = "JobStreamGapError";
  }
}

export async function watchJobStream<Item extends JsonValue = JsonValue>(
  client: unknown,
  job: string,
  options: JobStreamOptions,
): Promise<AsyncIterable<NamedStreamFrame<Item>>> {
  const call = resolveJobProcedure(client, job, "stream");
  const signal = options.signal ?? new AbortController().signal;
  const value = await timedCall(signal, options.readTimeoutMs ?? 10_000, (readSignal) =>
    call(
      {
        runId: options.runId,
        name: options.name,
        ...(options.after === undefined ? {} : { after: options.after }),
        ...(options.expectedIdentity === undefined
          ? {}
          : { expectedIdentity: options.expectedIdentity }),
      },
      { signal: readSignal },
    ),
  );
  const iterator = toAsyncIterator(value);
  return boundedStream(iterator, options);
}

async function* boundedStream<Item extends JsonValue>(
  iterator: AsyncIterator<unknown>,
  options: JobStreamOptions,
): AsyncGenerator<NamedStreamFrame<Item>> {
  const maxFrames = options.maxFrames ?? 128;
  const maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
  const maxItemBytes = options.maxItemBytes ?? 64 * 1024;
  let identity: string | undefined;
  let sequence: number | undefined;
  let frames = 0;
  let bytes = 0;
  const fallbackSignal = new AbortController().signal;
  try {
    while (true) {
      if (options.signal?.aborted) throw options.signal.reason;
      const next = await readWatchNext(
        iterator,
        options.signal ?? fallbackSignal,
        options.readTimeoutMs,
      );
      if (next.done === true) return;
      const frame = validateFrame(next.value) as NamedStreamFrame<Item>;
      const frameIdentity = streamIdentity(frame);
      if (frame.kind === "start" || frame.kind === "reset") {
        identity = frameIdentity;
        sequence = -1;
      } else if (identity !== frameIdentity) {
        identity = frameIdentity;
        sequence = -1;
      }
      if (frame.kind === "chunk") {
        const itemBytes = byteLength(frame.item);
        if (itemBytes > maxItemBytes) throw new JobStreamOverflowError("item-bytes");
        if (sequence !== undefined && frame.sequence > sequence + 1) {
          throw new JobStreamGapError(sequence + 1, frame.sequence);
        }
        if (sequence !== undefined && frame.sequence <= sequence) continue;
        sequence = frame.sequence;
      }
      const frameBytes = byteLength(frame);
      if (frames + 1 > maxFrames) throw new JobStreamOverflowError("frames");
      if (bytes + frameBytes > maxBytes) throw new JobStreamOverflowError("bytes");
      frames += 1;
      bytes += frameBytes;
      yield frame;
      if (frame.kind === "end") return;
    }
  } finally {
    await closeIterator(iterator);
  }
}

function streamIdentity(frame: NamedStreamFrame): string {
  return [frame.runId, frame.name, frame.attempt, frame.generation, frame.schemaVersion].join(
    "\u0000",
  );
}

function validateFrame(value: unknown): NamedStreamFrame {
  const kind = (value as { readonly kind?: unknown } | null)?.kind;
  if (
    value === null ||
    typeof value !== "object" ||
    typeof (value as { readonly kind?: unknown }).kind !== "string" ||
    typeof (value as { readonly runId?: unknown }).runId !== "string" ||
    typeof (value as { readonly name?: unknown }).name !== "string" ||
    typeof (value as { readonly attempt?: unknown }).attempt !== "number" ||
    !Number.isSafeInteger((value as { readonly attempt?: unknown }).attempt) ||
    typeof (value as { readonly generation?: unknown }).generation !== "string" ||
    typeof (value as { readonly schemaVersion?: unknown }).schemaVersion !== "string" ||
    (kind !== "start" && kind !== "chunk" && kind !== "reset" && kind !== "end")
  ) {
    throw new TypeError("Job stream returned an invalid named-content frame.");
  }
  if (kind === "chunk") {
    const chunk = value as { readonly sequence?: unknown; readonly item?: unknown };
    if (
      typeof chunk.sequence !== "number" ||
      !Number.isSafeInteger(chunk.sequence) ||
      chunk.sequence < 0 ||
      chunk.item === undefined
    ) {
      throw new TypeError("Job stream returned an invalid content chunk.");
    }
  }
  return value as NamedStreamFrame;
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
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
  throw new TypeError("Job stream procedure did not return an async iterator.");
}
