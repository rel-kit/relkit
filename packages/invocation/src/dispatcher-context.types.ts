import type { MaybePromise } from "@relkit/contracts";
import type {
  InvocationContextOptions,
  InvocationRecord,
  InvocationSource,
  PublicClock,
  PublicLogger,
} from "./contracts.js";
import type { ManagedDependencySources } from "./dispatcher-categories.types.js";
import type { ProgressEmitter } from "./progress.types.js";
import type { Effect } from "effect";

/** Custom factory that constructs a public invocation context.
 * The returned context must retain the supplied abort signal.
 * @param options - Record, signal, environment, and clock.
 * @returns A context value or Promise of one.
 * @example const factory: InvocationContextFactory<MyContext> = ({ signal }) => ({ signal });
 */
export type InvocationContextFactory<Context extends { readonly signal: AbortSignal }> = (
  options: InvocationContextOptions,
) => MaybePromise<Context>;

/** One immutable structured log entry with invocation correlation fields.
 * Records preserve the active trace and invocation IDs at write time.
 * @example const last = logger.records.at(-1) as StructuredLogRecord;
 */
export interface StructuredLogRecord {
  readonly level: "trace" | "debug" | "info" | "warn" | "error";
  readonly message: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly timestamp: string;
  readonly invocationId: string;
  readonly traceId: string;
  readonly functionId: string;
  readonly source: InvocationSource;
  readonly serviceId?: string;
  readonly requestId?: string;
  readonly originRequestId?: string;
  readonly spanId?: string;
  readonly correlationId?: string;
}

/** Public logger with immutable snapshots of emitted structured records.
 * Reading records does not expose its mutable internal buffer.
 * @example const latest = logger.records.at(-1);
 */
export interface LocalStructuredLogger extends PublicLogger {
  readonly records: readonly StructuredLogRecord[];
}

/** Structured logger with direct Effect write and read operations.
 * Both methods use the same invocation correlation as the public adapter.
 * @example await Effect.runPromise(logger.writeEffect("info", "ready"));
 */
export interface LocalEffectLogger extends LocalStructuredLogger {
  /** Writes one immutable record using the current invocation scope.
   * @param level - Log level.
   * @param message - Log text.
   * @param fields - Optional structured fields.
   * @returns Void with no expected failure.
   * @example Effect.runSync(logger.writeEffect("info", "ready"));
   */
  readonly writeEffect: (
    level: StructuredLogRecord["level"],
    message: string,
    fields?: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<void>;
  /** Reads an immutable snapshot of emitted records.
   * @returns Frozen records with no expected failure.
   * @example Effect.runSync(logger.recordsEffect());
   */
  readonly recordsEffect: () => Effect.Effect<readonly StructuredLogRecord[]>;
}

/** Inputs for assembling a standalone context and managed dependency maps.
 * Optional client maps expose only configured dependencies to the handler.
 * @example const context = await makeStandaloneContext({ record, signal, env, time, publishes: [] });
 */
export interface StandaloneContextOptions<Context extends { readonly signal: AbortSignal }> {
  readonly factory?: InvocationContextFactory<Context>;
  readonly record: InvocationRecord;
  readonly signal: AbortSignal;
  readonly env: Readonly<Record<string, unknown>>;
  readonly time: PublicClock;
  readonly logger?: PublicLogger;
  readonly clients?: ManagedDependencySources;
  readonly publishes: readonly string[];
  readonly progress?: ProgressEmitter;
}
