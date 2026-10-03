import type { LoggerOptions } from "@relkit/runtime-effect";
import type { RequestRecordSink } from "@relkit/observability";

/** Logging configuration retained across native Promise and streaming boundaries. */
export interface HttpLoggingOptions {
  readonly observability?: RequestRecordSink;
  readonly effectLogger?: LoggerOptions;
}
