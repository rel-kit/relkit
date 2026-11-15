/**
 * Chooses which retained record a full buffer gives up. Whole records of the lowest value go
 * first and the oldest of them first: framework success logs, then other logs, then unfinished
 * span revisions, then other records, then request starts. A request's completed record goes last,
 * so a request whose start was kept is never left without its end; a completed record carries
 * everything its start did, so a request whose start was given up still has a complete record.
 */
import type { EarlyLossKind, EarlyRetainedRecord } from "./early-records.types.js";
import type { ObservabilityRecord } from "./model.js";

/** Loss kinds in the order the buffer gives them up. */
export const EARLY_LOSS_KINDS = [
  "frameworkLogs",
  "logs",
  "spans",
  "other",
  "requestStarts",
  "requestEnds",
] as const satisfies readonly EarlyLossKind[];

/** Zero for every loss kind. */
export const noEarlyLoss = (): Readonly<Record<EarlyLossKind, number>> =>
  Object.freeze(Object.fromEntries(EARLY_LOSS_KINDS.map((kind) => [kind, 0]))) as Record<
    EarlyLossKind,
    number
  >;

/**
 * Classifies one record by what losing it costs.
 * @param record - Redacted retained record.
 * @returns Its loss kind; a completed span counts as other, since history keeps its final state.
 */
export function earlyLossKind(record: ObservabilityRecord): EarlyLossKind {
  if (record.signal === "log")
    return record.message === "Execution operation completed" &&
      record.fields?.outcome === "success" &&
      typeof record.fields.operation === "string"
      ? "frameworkLogs"
      : "logs";
  if (record.signal === "span") return record.status === "completed" ? "other" : "spans";
  if (record.signal === "request")
    return record.phase === "completed" ? "requestEnds" : "requestStarts";
  return "other";
}

/**
 * Finds the record a full buffer gives up next.
 * @param entries - Retained records, oldest first.
 * @returns The index of the oldest record of the lowest-value kind present, or -1 when empty.
 */
export function earlyEvictionIndex(entries: readonly EarlyRetainedRecord[]): number {
  let best = -1;
  let rank: number = EARLY_LOSS_KINDS.length;
  for (let index = 0; index < entries.length && rank > 0; index++) {
    const entry = entries[index]!;
    const next = EARLY_LOSS_KINDS.indexOf(entry.kind ?? earlyLossKind(entry.record));
    if (next < rank) {
      rank = next;
      best = index;
    }
  }
  return best;
}
