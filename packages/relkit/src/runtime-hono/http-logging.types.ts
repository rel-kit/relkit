import type { LoggerOptions } from "../runtime-effect/index.js";
import type { RequestRecordSink } from "../observability/index.js";

/** Logging configuration retained across native Promise and streaming boundaries. */
export interface HttpLoggingOptions {
  readonly observability?: RequestRecordSink;
  readonly effectLogger?: LoggerOptions;
}
