import { Effect } from "effect";
import { createObservabilityCollector } from "./collector.js";
import { createObservabilityStream } from "./stream.js";
import { normalizeTelemetryConfiguration } from "./telemetry-config.js";
import { telemetryExportDecision } from "./telemetry-sampling.js";
import { telemetryExporterDiagnostic } from "./telemetry-exporter-diagnostic.js";
import { createLocalBatchQueue } from "./local/batch-queue.js";
import { releaseResources } from "./resource-release.js";
import { remoteFetchLayer, remoteRequestEffect } from "./remote-request-effect.js";
import { makeDirectExportEffect } from "./direct-export.js";
import type { ObservabilityRecord } from "./model.js";
import type { ObservabilityQuery } from "./query-types.js";
import type { ObservabilityRuntimeOptions } from "./runtime.js";
import type { RemoteObservabilityOptions } from "./remote-runtime.types.js";
/**
 * Creates a remote observability runtime backed by the configured endpoint.
 *
 * @param options - Capture, export, and retention options.
 * @param remote - Remote endpoint and bearer token.
 * @returns A Promise with a runtime handle that owns queue and stream release.
 * @throws {Error} If configuration or remote setup fails.
 * @example
 * const runtime = await createRemoteObservabilityRuntime(options, remote);
 * await runtime.close();
 */
async function createRemoteObservabilityRuntime(
  options: ObservabilityRuntimeOptions,
  remote: RemoteObservabilityOptions,
) {
  const configuration = normalizeTelemetryConfiguration(options.configuration);
  const redaction = options.redaction ?? configuration.redaction;
  const collector = createObservabilityCollector({
    ...(redaction === undefined ? {} : { redaction }),
    ...(options.maxRecords === undefined && configuration.localRetention?.maxRecords === undefined
      ? {}
      : { maxRecords: options.maxRecords ?? configuration.localRetention!.maxRecords }),
    ...((options.signals ?? configuration.capture?.signals)
      ? { signals: options.signals ?? configuration.capture!.signals! }
      : {}),
  });
  const source = crypto.randomUUID();
  let sequence = 0;
  let storageError: string | undefined;
  let reportTimer: ReturnType<typeof setTimeout> | undefined;
  const request = <T>(path: string, init: RequestInit = {}): Promise<T> =>
    Effect.runPromise(
      remoteRequestEffect<T>(remote, path, init).pipe(
        Effect.provide(remoteFetchLayer),
        Effect.mapError((error) => new Error(error.message)),
      ),
    );
  const report = async (): Promise<void> => {
    clearTimeout(reportTimer);
    reportTimer = undefined;
    if (storageError)
      await request("/producer-status", {
        method: "POST",
        signal: AbortSignal.timeout(1_000),
        body: JSON.stringify({
          source,
          failed: queue.stats().failed,
          dropped: queue.stats().dropped,
        }),
      }).catch(() => undefined);
  };
  const queue = createLocalBatchQueue(
    async (records, signal) => {
      const send = () =>
        request("/records", {
          method: "POST",
          body: JSON.stringify({ records }),
          ...(signal === undefined
            ? {}
            : { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) }),
        });
      try {
        await send();
      } catch (error) {
        if (signal?.aborted) throw error;
        await send();
      }
    },
    (error) => {
      storageError = error instanceof Error ? error.message : String(error);
      reportTimer ??= setTimeout(() => void report(), 100);
    },
  );
  let closePromise: Promise<void> | undefined;
  const counters = { exportSelected: 0, sampledOut: 0, severityFiltered: 0, exportFailures: 0 };
  const exportRecord = options.exporter?.exportRecord ?? options.exportRecord;
  const directExport =
    exportRecord === undefined
      ? undefined
      : await Effect.runPromise(
          makeDirectExportEffect(exportRecord, () => {
            counters.exportFailures += 1;
          }),
        );
  const publish = (record: ReturnType<typeof collector.collect>, external = true) => {
    if (!record) return record;
    queue.enqueue({ key: `${source}:${++sequence}`, origin: "application", record });
    if (external) {
      const decision = telemetryExportDecision(record, configuration.exportSampling);
      if (decision === "export") counters.exportSelected++;
      else if (decision === "sampled-out") counters.sampledOut++;
      else counters.severityFiltered++;
      if (directExport !== undefined) Effect.runSync(directExport.enqueue({ record, decision }));
    }
    return record;
  };
  options.exporter?.setFailureHandler((failure) =>
    publish(collector.collectRequired(telemetryExporterDiagnostic(failure)), false),
  );
  const flush = async () => {
    await queue.flush();
    if (directExport !== undefined)
      await Effect.runPromise(directExport.flush().pipe(Effect.mapError((error) => error.cause)));
    await options.exporter?.flush();
    await queue.flush();
    await report();
  };
  const queryPath = async <T>(kind: string, input: object = {}): Promise<T> => {
    await queue.flush();
    const params = new URLSearchParams(
      Object.entries(input).map(([key, value]): [string, string] => [key, String(value)]),
    );
    return request<T>(`/_relkit/v1/${kind}?${params}`);
  };
  const query: ObservabilityQuery = {
    logs: (input) => queryPath("logs", input),
    requests: (input) => queryPath("requests", input),
    traces: (input) => queryPath("traces", input),
    log: (id) => queryPath(`logs/${encodeURIComponent(id)}`),
    request: (id) => queryPath(`requests/${encodeURIComponent(id)}`),
    trace: (id) => queryPath(`traces/${encodeURIComponent(id)}`),
  };
  const stream = createObservabilityStream();
  return Object.freeze({
    protocol: collector.protocol,
    version: collector.version,
    collect: (record: ObservabilityRecord) => publish(collector.collect(record)),
    emit: (event: unknown) => publish(collector.emit(event)),
    read: collector.read,
    readRecords: collector.read,
    capture: collector.capture,
    query,
    stream,
    flush,
    exporterStats: () => options.exporter?.stats() ?? Object.freeze([]),
    exportCounters: () => ({
      persisted: queue.stats().persisted,
      streamed: queue.stats().persisted,
      ...counters,
      localStorage: { ...queue.stats(), error: storageError },
    }),
    close: () =>
      (closePromise ??= releaseResources([
        flush,
        () =>
          directExport === undefined
            ? undefined
            : Effect.runPromise(directExport.close().pipe(Effect.mapError((error) => error.cause))),
        () => options.exporter?.close(),
        () => queue.close(),
        () => stream.close(),
        () => clearTimeout(reportTimer),
      ])),
  });
}
export const remoteRuntimeCore = { createRemoteObservabilityRuntime };
