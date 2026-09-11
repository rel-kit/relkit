import type { MaybePromise } from "@relkit/contracts";
import { validate, type StandardSchemaV1 } from "@relkit/schema";

export const MAX_PROGRESS_RECORD_BYTES = 256 * 1024;

export interface ProgressSink {
  readonly emit: (value: unknown, signal: AbortSignal) => MaybePromise<void>;
}

export interface ProgressEmitter<Value = unknown> {
  readonly emit: (value: Value) => Promise<void>;
}

export class ProgressEmissionError extends Error {
  constructor(
    readonly code:
      | "RELKIT_PROGRESS_VALIDATION"
      | "RELKIT_PROGRESS_TOO_LARGE"
      | "RELKIT_PROGRESS_AFTER_SETTLEMENT",
    message: string,
  ) {
    super(message);
    this.name = "ProgressEmissionError";
  }
}

export function createProgressEmitter(
  schema: StandardSchemaV1,
  signal: AbortSignal,
  sink: ProgressSink = discardProgress,
): { readonly emitter: ProgressEmitter; readonly settle: () => void } {
  let settled = false;
  return {
    emitter: Object.freeze({
      emit: async (value: unknown) => {
        if (settled) {
          throw new ProgressEmissionError(
            "RELKIT_PROGRESS_AFTER_SETTLEMENT",
            "Progress cannot be emitted after invocation settlement.",
          );
        }
        const result = await validate(schema, value as never);
        if (!("value" in result)) {
          throw new ProgressEmissionError(
            "RELKIT_PROGRESS_VALIDATION",
            "Progress validation failed.",
          );
        }
        const bytes = new TextEncoder().encode(
          JSON.stringify({ type: "progress", value: result.value }),
        ).byteLength;
        if (bytes > MAX_PROGRESS_RECORD_BYTES) {
          throw new ProgressEmissionError(
            "RELKIT_PROGRESS_TOO_LARGE",
            `Progress record exceeds ${MAX_PROGRESS_RECORD_BYTES} encoded bytes.`,
          );
        }
        await sink.emit(result.value, signal);
      },
    }),
    settle: () => {
      settled = true;
    },
  };
}

const discardProgress: ProgressSink = Object.freeze({ emit: () => undefined });
