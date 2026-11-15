/**
 * Shapes what an application hands its development inspection stream. Every span attribute and
 * event produces a full revision of that span, so one request yields dozens of span records of
 * which history keeps only the latest; an unsent revision is therefore replaced by its successor.
 * The framework's own success logs (`Execution operation completed`) repeat what the span of the
 * same operation already carries and stay out of the stream unless they are asked for.
 */
import type { ObservabilityRecord } from "./model.js";

/** How long an unfinished span revision waits for a successor before it is sent. */
export const INSPECTION_SPAN_DELAY_MS = 100;

/** Choices of the application's inspection stream. */
export interface InspectionStreamOptions {
  /** Sends the framework's success logs too; failures and application logs are always sent. */
  readonly frameworkSuccessLogs?: boolean;
  /** Milliseconds an unfinished span revision is held; defaults to {@link INSPECTION_SPAN_DELAY_MS}. */
  readonly spanDelayMs?: number;
}

/** The stream's entry point and its owned timer. */
export interface InspectionStream {
  /** Sends, holds or withholds one admitted record. */
  readonly offer: (record: ObservabilityRecord) => void;
  /** Sends every held span revision now. */
  readonly flush: () => void;
  /** Withheld framework success logs, cumulative. */
  readonly withheld: () => number;
}

/**
 * Whether a record is a success completion log of a framework operation.
 * @param record - Admitted record.
 * @returns True for `Execution operation completed` with a success outcome and its operation labels.
 */
export function isFrameworkSuccessLog(record: ObservabilityRecord): boolean {
  if (record.signal !== "log" || record.message !== "Execution operation completed") return false;
  const fields = record.fields ?? {};
  return (
    fields.outcome === "success" &&
    typeof fields.domain === "string" &&
    typeof fields.operation === "string"
  );
}

/**
 * Creates the stream in front of one ordered transport.
 * @param send - Hands one record to the transport, in the order it is to be stored.
 * @param options - Success-log and span-delay choices.
 * @returns The stream; a completed span revision is sent at once and drops any held one.
 * @example
 * const stream = createInspectionStream((record) => queue.enqueue(record));
 * stream.offer(record);
 * stream.flush();
 */
export function createInspectionStream(
  send: (record: ObservabilityRecord) => void,
  options: InspectionStreamOptions = {},
): InspectionStream {
  const held = new Map<string, ObservabilityRecord>();
  const delay = options.spanDelayMs ?? INSPECTION_SPAN_DELAY_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let withheld = 0;
  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    const pending = [...held.values()];
    held.clear();
    for (const record of pending) send(record);
  };
  const offer = (record: ObservabilityRecord): void => {
    if (!options.frameworkSuccessLogs && isFrameworkSuccessLog(record)) {
      withheld += 1;
      return;
    }
    if (record.signal !== "span") return send(record);
    const key = `${record.traceId}:${record.spanId}`;
    held.delete(key);
    if (record.status === "completed") return send(record);
    held.set(key, record);
    if (timer === undefined) {
      timer = setTimeout(flush, delay);
      // A held revision never keeps a finished process alive; close flushes it.
      (timer as { unref?: () => void }).unref?.();
    }
  };
  return { offer, flush, withheld: () => withheld };
}
