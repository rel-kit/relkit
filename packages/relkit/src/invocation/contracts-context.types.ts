import type { Effect } from "effect";
import type { PublicTrace } from "./public-trace.js";
import type { InvocationRecord, InvocationSource } from "./contracts.types.js";

/** Public logger supplied to invocation handlers.
 * Messages can include structured fields; the implementation adds invocation correlation.
 * @example context.log.info("completed", { count: 3 });
 */
export interface PublicLogger {
  /** Emits a trace message. @param message - Log text. @param fields - Optional data. @returns Void. @example log.trace("started"); */
  readonly trace: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  /** Emits a debug message. @param message - Log text. @param fields - Optional data. @returns Void. @example log.debug("loaded"); */
  readonly debug: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  /** Emits an info message. @param message - Log text. @param fields - Optional data. @returns Void. @example log.info("done"); */
  readonly info: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  /** Emits a warning. @param message - Log text. @param fields - Optional data. @returns Void. @example log.warn("late"); */
  readonly warn: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  /** Emits an error message. @param message - Log text. @param fields - Optional data. @returns Void. @example log.error("failed"); */
  readonly error: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
}

/** Clock exposed to user handlers with abortable sleep.
 * Sleep rejects when the owning invocation is cancelled.
 * @example await context.time.sleep(100);
 */
export interface PublicClock {
  /** Reads current time. @returns Current date. @example time.now(); */
  readonly now: () => Date;
  /** Sleeps until duration elapses or the invocation aborts. @param milliseconds - Delay in milliseconds. @returns A completion Promise. @example await time.sleep(100); */
  readonly sleep: (milliseconds: number) => Promise<void>;
}

/** Stable invocation metadata visible to handlers and completion hooks.
 * Optional run and task fields appear only for work dispatched from a job.
 * @example const invocationId = context.invocation.id;
 */
export interface InvocationMetadata {
  readonly id: string;
  readonly parentId?: string;
  readonly traceId: string;
  readonly correlationId?: string;
  readonly startedAt: string;
  readonly deadline?: string;
  readonly attempt: number;
  readonly source: InvocationSource;
  readonly serviceId?: string;
  readonly runId?: string;
  readonly jobId?: string;
  readonly taskId?: string;
  readonly taskVersion?: string;
  readonly buildId?: string;
  readonly serviceGeneration?: string;
}

/** Handler context with tracing, time, logging, and managed clients.
 * The signal controls the lifetime of work started by the handler.
 * @example async function handler(_input: unknown, context: InvocationContext) { context.log.info("started"); }
 */
export interface InvocationContext {
  readonly trace: PublicTrace;
  readonly invocation: InvocationMetadata;
  readonly signal: AbortSignal;
  readonly env: Readonly<Record<string, unknown>>;
  readonly log: PublicLogger;
  readonly time: PublicClock;
  readonly tasks: Readonly<Record<string, never>>;
  readonly jobs: Readonly<Record<string, never>>;
  readonly events: Readonly<Record<string, never>>;
  readonly buckets: Readonly<Record<string, never>>;
  readonly cache: Readonly<Record<string, never>>;
  readonly agents: Readonly<Record<string, never>>;
  readonly database: Readonly<Record<string, never>>;
  readonly auth: { readonly getSession: () => Promise<unknown | null> };
  readonly constants: Readonly<Record<string, never>>;
  readonly prompts: Readonly<Record<string, never>>;
  readonly trigger?: unknown;
}

/** Inputs passed to a custom invocation context factory.
 * The factory must preserve the supplied signal and invocation record.
 * @example const factory = ({ signal, invocation }: InvocationContextOptions) => ({ signal, invocation });
 */
export interface InvocationContextOptions {
  readonly invocation: InvocationRecord;
  readonly signal: AbortSignal;
  readonly env: Readonly<Record<string, unknown>>;
  readonly time: PublicClock;
}

/** Injectable Effect runner for handler lifecycle work.
 * The runner forwards its optional signal to the underlying Effect runtime.
 * @example await runner.run(Effect.succeed(1), { signal });
 */
export interface InvocationRunner {
  /** Runs one Effect under an optional abort signal.
   * @param effect - Effect to run.
   * @param options - Optional signal.
   * @returns The Effect success value or rejection with its failure.
   * @example await runner.run(Effect.succeed(1));
   */
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, never>,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<A>;
}
