import {
  isRedactedObservabilityRecord,
  type RedactedObservabilityRecord,
} from "./record-admission.js";

export type TelemetryExportOverflow = "drop-oldest" | "drop-newest";

export interface TelemetryExportUnit {
  readonly id: string;
  readonly records: readonly RedactedObservabilityRecord[];
}

export interface TelemetryExportQueueStats {
  readonly receivedRecords: number;
  readonly queuedRecords: number;
  readonly queuedUnits: number;
  readonly droppedRecords: number;
  readonly droppedUnits: number;
}

export function createBoundedTelemetryExportQueue(options: {
  readonly maxRecords: number;
  readonly overflow?: TelemetryExportOverflow;
  readonly mergeAdjacent?: boolean;
}) {
  const maximum = positive(options.maxRecords);
  const overflow = options.overflow ?? "drop-oldest";
  const units: TelemetryExportUnit[] = [];
  let receivedRecords = 0;
  let queuedRecords = 0;
  let droppedRecords = 0;
  let droppedUnits = 0;

  const drop = (unit: TelemetryExportUnit): void => {
    droppedRecords += unit.records.length;
    droppedUnits += 1;
  };
  const enqueue = (input: TelemetryExportUnit): boolean => {
    const incoming = normalize(input);
    receivedRecords += incoming.records.length;
    const previous = options.mergeAdjacent ? units.at(-1) : undefined;
    const unit =
      previous?.id === incoming.id
        ? normalize({ id: incoming.id, records: [...previous.records, ...incoming.records] })
        : incoming;
    if (previous?.id === incoming.id) {
      units.pop();
      queuedRecords -= previous.records.length;
    }
    if (unit.records.length > maximum) {
      drop(unit);
      return false;
    }
    if (overflow === "drop-newest" && queuedRecords + unit.records.length > maximum) {
      drop(unit);
      return false;
    }
    while (queuedRecords + unit.records.length > maximum) {
      const removed = units.shift()!;
      queuedRecords -= removed.records.length;
      drop(removed);
    }
    units.push(unit);
    queuedRecords += unit.records.length;
    return true;
  };
  const take = (): TelemetryExportUnit | undefined => {
    const unit = units.shift();
    if (unit !== undefined) queuedRecords -= unit.records.length;
    return unit;
  };
  const dropAll = (): void => {
    for (const unit of units.splice(0)) drop(unit);
    queuedRecords = 0;
  };
  const stats = (): TelemetryExportQueueStats =>
    Object.freeze({
      receivedRecords,
      queuedRecords,
      queuedUnits: units.length,
      droppedRecords,
      droppedUnits,
    });
  return Object.freeze({ enqueue, take, dropAll, stats });
}

function normalize(value: TelemetryExportUnit): TelemetryExportUnit {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof value.id !== "string" ||
    value.id === "" ||
    !Array.isArray(value.records) ||
    value.records.length === 0 ||
    value.records.some((record) => !isRedactedObservabilityRecord(record))
  )
    throw new TypeError("Telemetry export unit is invalid");
  return Object.freeze({ id: value.id, records: Object.freeze([...value.records]) });
}

function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new RangeError("Telemetry export queue maxRecords must be a positive safe integer");
  return value;
}
