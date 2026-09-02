import type { ObservabilityRecord } from "./model.js";
import { createObservabilityCollector, type ObservabilityCollectorOptions } from "./collector.js";
import { createObservabilityQuery, type ObservabilityQuery } from "./query.js";
import { createObservabilityStream, type ObservabilityStreamEventType } from "./stream.js";
import { createObservabilityIndex } from "./storage/index.js";
import { createObservabilitySegmentStore } from "./storage/segments.js";
import {
  normalizeTelemetryConfiguration,
  type TelemetryConfiguration,
} from "./telemetry-config.js";
import { telemetryExporterDiagnostic } from "./telemetry-exporter-diagnostic.js";
import type { TelemetryExporterFanout } from "./telemetry-exporter-types.js";
import {
  telemetryExportDecision,
  type TelemetryExportDecision,
  type TelemetryExportRecord,
} from "./telemetry-sampling.js";

export interface TelemetryPipelineCounters {
  readonly persisted: number;
  readonly streamed: number;
  readonly exportSelected: number;
  readonly sampledOut: number;
  readonly severityFiltered: number;
  readonly exportFailures: number;
}

export interface ObservabilityRuntimeOptions extends ObservabilityCollectorOptions {
  readonly root?: string;
  readonly configuration?: TelemetryConfiguration;
  readonly exportRecord?: TelemetryExportRecord;
  readonly exporter?: TelemetryExporterFanout;
}

export async function createObservabilityRuntime(options: ObservabilityRuntimeOptions = {}) {
  const configuration = normalizeTelemetryConfiguration(options.configuration);
  const redaction = options.redaction ?? configuration.redaction;
  const collector = createObservabilityCollector({
    ...(options.maxRecords === undefined && configuration.localRetention?.maxRecords === undefined
      ? {}
      : { maxRecords: options.maxRecords ?? configuration.localRetention!.maxRecords }),
    ...(redaction === undefined ? {} : { redaction }),
    ...(options.signals === undefined && configuration.capture?.signals === undefined
      ? {}
      : { signals: options.signals ?? configuration.capture!.signals }),
  });
  const shared = {
    ...(options.root === undefined ? {} : { root: options.root }),
    ...(redaction === undefined ? {} : { redaction }),
    ...(configuration.localRetention === undefined
      ? {}
      : { retention: retention(configuration.localRetention) }),
  };
  const index = await createObservabilityIndex(shared);
  const store = await createObservabilitySegmentStore({
    ...shared,
    index,
  });
  const baseQuery = createObservabilityQuery(index, shared);
  const stream = createObservabilityStream(shared);
  const exportRecord = options.exporter?.exportRecord ?? options.exportRecord;
  const pending = new Set<Promise<unknown>>();
  const counters = {
    persisted: 0,
    streamed: 0,
    exportSelected: 0,
    sampledOut: 0,
    severityFiltered: 0,
    exportFailures: 0,
  };
  const persist = (record: ObservabilityRecord | undefined, external = true): void => {
    if (record === undefined) return;
    const write = store
      .append(record)
      .then(async (persisted) => {
        if (persisted === undefined) return;
        counters.persisted += 1;
        const type = streamType(persisted);
        if (type !== undefined) {
          stream.publishRecord(type, persisted);
          counters.streamed += 1;
        }
        if (!external) return;
        const decision = telemetryExportDecision(persisted, configuration.exportSampling);
        countDecision(counters, decision);
        if (exportRecord !== undefined)
          try {
            await exportRecord(persisted, decision);
          } catch (error) {
            counters.exportFailures += 1;
            throw error;
          }
      })
      .finally(() => pending.delete(write));
    pending.add(write);
  };
  options.exporter?.setFailureHandler((failure) =>
    persist(collector.collectRequired(telemetryExporterDiagnostic(failure)), false),
  );
  const flushLocal = async (): Promise<void> => {
    await Promise.all([...pending]);
    await store.flush();
    await index.flush();
  };
  const flush = async (): Promise<void> => {
    await flushLocal();
    await options.exporter?.flush();
    await flushLocal();
  };
  const query: ObservabilityQuery = Object.freeze({
    requests: async (value: Parameters<ObservabilityQuery["requests"]>[0]) => {
      await flush();
      return baseQuery.requests(value);
    },
    request: async (id: string) => {
      await flush();
      return baseQuery.request(id);
    },
    logs: async (value: Parameters<ObservabilityQuery["logs"]>[0]) => {
      await flush();
      return baseQuery.logs(value);
    },
    log: async (cursor: string) => {
      await flush();
      return baseQuery.log(cursor);
    },
    traces: async (value: Parameters<ObservabilityQuery["traces"]>[0]) => {
      await flush();
      return baseQuery.traces(value);
    },
    trace: async (id: string) => {
      await flush();
      return baseQuery.trace(id);
    },
  });
  return Object.freeze({
    protocol: collector.protocol,
    version: collector.version,
    collect: (record: ObservabilityRecord) => {
      const admitted = collector.collect(record);
      persist(admitted);
      return admitted;
    },
    emit: (event: unknown) => {
      const admitted = collector.emit(event);
      persist(admitted);
      return admitted;
    },
    read: collector.read,
    readRecords: collector.read,
    query,
    stream,
    exporterStats: () => options.exporter?.stats() ?? Object.freeze([]),
    exportCounters: (): TelemetryPipelineCounters => Object.freeze({ ...counters }),
    flush,
    close: async () => {
      await flush();
      await options.exporter?.close();
      await flushLocal();
      stream.close();
      await store.close();
      await index.close();
    },
  });
}

function countDecision(
  counters: { exportSelected: number; sampledOut: number; severityFiltered: number },
  decision: TelemetryExportDecision,
): void {
  if (decision === "export") counters.exportSelected += 1;
  else if (decision === "sampled-out") counters.sampledOut += 1;
  else counters.severityFiltered += 1;
}

function retention(value: NonNullable<TelemetryConfiguration["localRetention"]>) {
  const { maxRecords: _, ...policy } = value;
  return policy;
}

function streamType(record: ObservabilityRecord): ObservabilityStreamEventType | undefined {
  if (record.signal === "request") return "request.completed";
  if (record.signal === "log") return "log.emitted";
  if (record.signal === "span")
    return record.status === "started" ? "span.started" : "span.completed";
  if (record.signal === "job") return "job.changed";
  if (record.signal === "event")
    return record.kind === "publication" ? "event.published" : "event.delivery.changed";
  if (record.signal === "generation") return "generation.changed";
  return record.signal === "diagnostic" ? "diagnostic.changed" : undefined;
}
