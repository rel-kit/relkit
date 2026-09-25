import type { ObservabilityRecord } from "./model.js";
import { createRemoteObservabilityRuntime } from "./remote-runtime.js";
import { createObservabilityCollector } from "./collector.js";
import { createObservabilityQuery, type ObservabilityQuery } from "./query.js";
import { createObservabilityStream } from "./stream.js";
import { streamType } from "./runtime-stream-type.js";
import { createObservabilityIndex } from "./storage/index.js";
import { createObservabilitySegmentStore } from "./storage/segments.js";
import { normalizeTelemetryConfiguration } from "./telemetry-config.js";
import { telemetryExporterDiagnostic } from "./telemetry-exporter-diagnostic.js";
import { releaseResources } from "./resource-release.js";
import { telemetryExportDecision } from "./telemetry-sampling.js";
import { Effect } from "effect";
import { makeDirectExportEffect } from "./direct-export.js";
import type { ObservabilityRuntimeOptions, TelemetryPipelineCounters } from "./runtime.types.js";
/**
 * Creates the local or remote observability runtime with owned resources.
 *
 * @param options - Retention, export, storage, and remote endpoint settings.
 * @returns A Promise with the runtime handle, including flush and close methods.
 * @throws {Error} If storage acquisition or configuration fails.
 * @example
 * const runtime = await createObservabilityRuntime({ root: "/tmp/observability" });
 * await runtime.close();
 */
async function createObservabilityRuntime(options: ObservabilityRuntimeOptions = {}) {
  if (options.remote !== undefined)
    return createRemoteObservabilityRuntime(options, options.remote);
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
  let store: Awaited<ReturnType<typeof createObservabilitySegmentStore>>;
  try {
    store = await createObservabilitySegmentStore({ ...shared, index });
  } catch (error) {
    await index.close().catch(() => undefined);
    throw error;
  }
  let baseQuery: ReturnType<typeof createObservabilityQuery>;
  let stream: ReturnType<typeof createObservabilityStream>;
  try {
    baseQuery = createObservabilityQuery(index, shared);
    stream = createObservabilityStream(shared);
  } catch (error) {
    await releaseResources([() => store.close(), () => index.close()]).catch(() => undefined);
    throw error;
  }
  const exportRecord = options.exporter?.exportRecord ?? options.exportRecord;
  const pending = new Set<Promise<unknown>>();
  let persistFailure: unknown;
  let hasPersistFailure = false;
  let closePromise: Promise<void> | undefined;
  const counters = {
    persisted: 0,
    streamed: 0,
    exportSelected: 0,
    sampledOut: 0,
    severityFiltered: 0,
    exportFailures: 0,
  };
  const directExport =
    exportRecord === undefined
      ? undefined
      : await Effect.runPromise(
          makeDirectExportEffect(exportRecord, () => {
            counters.exportFailures += 1;
          }),
        );
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
        if (decision === "export") counters.exportSelected += 1;
        else if (decision === "sampled-out") counters.sampledOut += 1;
        else counters.severityFiltered += 1;
        if (directExport !== undefined)
          Effect.runSync(directExport.enqueue({ record: persisted, decision }));
      })
      .catch((error: unknown) => {
        if (!hasPersistFailure) {
          persistFailure = error;
          hasPersistFailure = true;
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
    if (hasPersistFailure) throw persistFailure;
    await store.flush();
    await index.flush();
  };
  const flush = async (): Promise<void> => {
    await flushLocal();
    if (directExport !== undefined)
      await Effect.runPromise(directExport.flush().pipe(Effect.mapError((error) => error.cause)));
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
    capture: collector.capture,
    query,
    stream,
    exporterStats: () => options.exporter?.stats() ?? Object.freeze([]),
    exportCounters: (): TelemetryPipelineCounters => Object.freeze({ ...counters }),
    flush,
    close: () =>
      (closePromise ??= releaseResources([
        flush,
        () =>
          directExport === undefined
            ? undefined
            : Effect.runPromise(directExport.close().pipe(Effect.mapError((error) => error.cause))),
        () => options.exporter?.close(),
        flushLocal,
        () => stream.close(),
        () => store.close(),
        () => index.close(),
      ])),
  });
}
function retention(
  value: NonNullable<NonNullable<ObservabilityRuntimeOptions["configuration"]>["localRetention"]>,
) {
  const { maxRecords: _, ...policy } = value;
  return policy;
}
export const runtimeCore = { createObservabilityRuntime };
