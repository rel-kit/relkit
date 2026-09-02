import {
  createBoundedTelemetryExportQueue,
  type RedactedObservabilityRecord,
  type TelemetryExporterFactoryContext,
  type TelemetryExporterRuntime,
  type TelemetryExporterRuntimeStats,
} from "@relkit/observability";
import { createOtlpTransport, type OtlpSignal, type OtlpTransport } from "./transport.js";
import {
  combinedSignal,
  nonNegative,
  otlpPayload,
  otlpSignalFor,
  otlpUnitId,
  positive,
  text,
  textMap,
  within,
} from "./exporter-support.js";

export interface OtlpExporterOptions {
  readonly transport: OtlpTransport;
  readonly serviceName?: string;
  readonly maxRecords?: number;
  readonly batchSize?: number;
  readonly maxRetries?: number;
  readonly retryDelayMs?: number;
  readonly signal?: AbortSignal;
  readonly delay?: (milliseconds: number) => Promise<void>;
}

export interface OtlpExporter extends TelemetryExporterRuntime {
  readonly stats: () => TelemetryExporterRuntimeStats & {
    readonly exportedRecords: number;
    readonly retries: number;
  };
}

export function createOtlpExporter(options: OtlpExporterOptions): OtlpExporter {
  const maximum = positive(options.maxRecords ?? 1_024, "maxRecords");
  const batchSize = positive(options.batchSize ?? 64, "batchSize");
  const maxRetries = nonNegative(options.maxRetries ?? 2, "maxRetries");
  const retryDelayMs = nonNegative(options.retryDelayMs ?? 25, "retryDelayMs");
  const delay =
    options.delay ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const queue = createBoundedTelemetryExportQueue({ maxRecords: maximum, mergeAdjacent: true });
  let worker: Promise<void> | undefined;
  let activeAbort: AbortController | undefined;
  let closing = false;
  let sequence = 0;
  let exportedRecords = 0;
  let failedRecords = 0;
  let failedUnits = 0;
  let failures = 0;
  let retries = 0;

  const start = (): void => {
    if (worker !== undefined) return;
    const current = Promise.resolve()
      .then(drain)
      .finally(() => {
        if (worker === current) worker = undefined;
        if (!closing && queue.stats().queuedUnits > 0) start();
      });
    worker = current;
  };
  const exportRecord = (record: RedactedObservabilityRecord): void => {
    if (closing) throw new Error("OTLP exporter is closed");
    queue.enqueue({ id: otlpUnitId(record, ++sequence), records: [record] });
    start();
  };
  const flush = async (timeoutMs = 1_000): Promise<void> => {
    start();
    if (!(await within(worker ?? Promise.resolve(), timeoutMs))) {
      activeAbort?.abort();
      queue.dropAll();
      return;
    }
    await within(options.transport.flush(), timeoutMs);
  };
  const close = async (timeoutMs = 1_000): Promise<void> => {
    if (closing) return;
    closing = true;
    await flush(timeoutMs);
    await within(options.transport.close(), timeoutMs);
  };
  const stats = () => {
    const queued = queue.stats();
    return Object.freeze({
      queuedRecords: queued.queuedRecords,
      queuedUnits: queued.queuedUnits,
      droppedRecords: queued.droppedRecords + failedRecords,
      droppedUnits: queued.droppedUnits + failedUnits,
      failures,
      exportedRecords,
      retries,
    });
  };

  async function drain(): Promise<void> {
    for (let first = queue.take(); first !== undefined; first = queue.take()) {
      const units = [first];
      let records = first.records.length;
      while (records < batchSize) {
        const next = queue.take();
        if (next === undefined) break;
        units.push(next);
        records += next.records.length;
      }
      for (const signal of ["logs", "traces"] as const) {
        const selected = units.flatMap((unit) =>
          unit.records
            .filter((record) => otlpSignalFor(record) === signal)
            .map((record) => ({ id: unit.id, record })),
        );
        if (selected.length > 0) await send(signal, selected);
      }
    }
  }

  async function send(
    signal: OtlpSignal,
    selected: readonly { readonly id: string; readonly record: RedactedObservabilityRecord }[],
  ): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      activeAbort = new AbortController();
      try {
        await options.transport.send(
          signal,
          otlpPayload(
            options.serviceName,
            selected.map(({ record }) => record),
          ),
          combinedSignal(activeAbort.signal, options.signal),
        );
        exportedRecords += selected.length;
        return;
      } catch {
        failures += 1;
        if (attempt >= maxRetries || activeAbort.signal.aborted || options.signal?.aborted) {
          failedRecords += selected.length;
          failedUnits += new Set(selected.map(({ id }) => id)).size;
          return;
        }
        retries += 1;
        await delay(retryDelayMs * 2 ** attempt);
      } finally {
        activeAbort = undefined;
      }
    }
  }

  return Object.freeze({ exportRecord, flush, close, stats });
}

export async function createTelemetryExporter(
  context: TelemetryExporterFactoryContext,
): Promise<TelemetryExporterRuntime> {
  const endpoint = text(context.configuration.endpoint, "endpoint");
  const headers = context.configuration.headers;
  return createOtlpExporter({
    transport: createOtlpTransport({
      endpoint,
      ...(headers === undefined ? {} : { headers: textMap(headers) }),
    }),
    ...(context.configuration.serviceName === undefined
      ? {}
      : { serviceName: text(context.configuration.serviceName, "serviceName") }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
}
