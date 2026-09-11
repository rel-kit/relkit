import { validate, type StandardSchemaV1 } from "@relkit/schema";

export class RelkitStreamError extends Error {
  constructor(
    readonly code:
      | "RELKIT_STREAM_ALREADY_CONSUMED"
      | "RELKIT_STREAM_ITEM_TOO_LARGE"
      | "RELKIT_STREAM_CONSUMER_IDLE",
    message: string,
  ) {
    super(message);
    this.name = "RelkitStreamError";
  }
}

export function isStreamOutput(value: unknown): value is {
  readonly kind: "stream";
  readonly item: StandardSchemaV1;
} {
  return isRecord(value) && value.kind === "stream" && isRecord(value.item);
}

export function lazySingleConsumerStream<T>(
  start: () => Promise<AsyncIterable<T>>,
): AsyncIterable<T> {
  let consumed = false;
  return Object.freeze({
    [Symbol.asyncIterator](): AsyncIterator<T> {
      if (consumed) {
        return failingIterator(
          new RelkitStreamError(
            "RELKIT_STREAM_ALREADY_CONSUMED",
            "A Relkit stream can be consumed only once",
          ),
        );
      }
      consumed = true;
      let iterator: AsyncIterator<T> | undefined;
      const get = async (): Promise<AsyncIterator<T>> => {
        iterator ??= (await start())[Symbol.asyncIterator]();
        return iterator;
      };
      return {
        next: async () => (await get()).next(),
        return: async (value?: unknown) => {
          if (iterator === undefined) return { value: value as T, done: true };
          return iterator.return?.(value) ?? { value: value as T, done: true };
        },
        throw: async (error?: unknown) => {
          const source = await get();
          if (source.throw) return source.throw(error);
          throw error;
        },
      };
    },
  });
}

export function managedValidatedStream<T>(options: {
  readonly source: AsyncIterable<unknown>;
  readonly schema: StandardSchemaV1;
  readonly maxItemBytes: number;
  readonly idleMs: number;
  readonly abort: (reason: unknown) => void;
  readonly run: <A>(work: () => Promise<A>) => Promise<A>;
  readonly settle: (error?: unknown) => Promise<void>;
}): AsyncIterable<T> {
  let consumed = false;
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      if (consumed) {
        return failingIterator(
          new RelkitStreamError("RELKIT_STREAM_ALREADY_CONSUMED", "A stream can be consumed once"),
        );
      }
      consumed = true;
      const source = options.source[Symbol.asyncIterator]();
      let settled = false;
      let idle: ReturnType<typeof setTimeout> | undefined;
      const finish = async (error?: unknown): Promise<void> => {
        if (settled) return;
        settled = true;
        if (idle !== undefined) clearTimeout(idle);
        await options.settle(error);
      };
      const armIdle = (): void => {
        if (idle !== undefined) clearTimeout(idle);
        idle = setTimeout(() => {
          const error = new RelkitStreamError(
            "RELKIT_STREAM_CONSUMER_IDLE",
            "Stream consumer remained idle after execution started",
          );
          options.abort(error);
          void options.run(async () => source.return?.()).finally(() => finish(error));
        }, options.idleMs);
      };
      armIdle();
      return {
        next: async () => {
          if (idle !== undefined) clearTimeout(idle);
          try {
            const result = await options.run(() => source.next());
            if (result.done) {
              await finish();
              return { value: undefined as T, done: true };
            }
            const validated = await validate(options.schema, result.value);
            if (!("value" in validated)) throw new TypeError("Stream item validation failed");
            const value = validated.value as T;
            if (encodedBytes(value) > options.maxItemBytes) {
              throw new RelkitStreamError(
                "RELKIT_STREAM_ITEM_TOO_LARGE",
                "Encoded stream item exceeds the configured limit",
              );
            }
            armIdle();
            return { value, done: false };
          } catch (error) {
            options.abort(error);
            await options.run(async () => source.return?.());
            await finish(error);
            throw error;
          }
        },
        return: async (value?: unknown) => {
          options.abort(new DOMException("Stream consumer cancelled", "AbortError"));
          try {
            await options.run(async () => source.return?.(value));
          } finally {
            await finish();
          }
          return { value: value as T, done: true };
        },
      };
    },
  };
}

function encodedBytes(value: unknown): number {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("Stream item is not JSON encodable");
  return new TextEncoder().encode(encoded).byteLength;
}

function failingIterator<T>(error: Error): AsyncIterator<T> {
  return { next: () => Promise.reject(error) };
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object";
}
