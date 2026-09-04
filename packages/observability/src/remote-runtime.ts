import { createObservabilityCollector } from "./collector.js";
import { createObservabilityStream } from "./stream.js";
import { normalizeTelemetryConfiguration } from "./telemetry-config.js";
import { telemetryExportDecision } from "./telemetry-sampling.js";
import { telemetryExporterDiagnostic } from "./telemetry-exporter-diagnostic.js";
import { createLocalBatchQueue } from "./local/batch-queue.js";
import type { ObservabilityRecord } from "./model.js";
import type { ObservabilityQuery } from "./query-types.js";
import type { ObservabilityRuntimeOptions } from "./runtime.js";

export interface RemoteObservabilityOptions {
  readonly url: string;
  readonly token: string;
}

export async function createRemoteObservabilityRuntime(
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
  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${remote.url}${path}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${remote.token}` },
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Telemetry storage returned ${response.status}`);
    return response.json() as Promise<T>;
  };
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
    async (records) => {
      const send = () => request("/records", { method: "POST", body: JSON.stringify({ records }) });
      try {
        await send();
      } catch {
        await send();
      }
    },
    (error) => {
      storageError = error instanceof Error ? error.message : String(error);
      reportTimer ??= setTimeout(() => void report(), 100);
    },
  );
  const exports = new Set<Promise<unknown>>();
  const counters = { exportSelected: 0, sampledOut: 0, severityFiltered: 0, exportFailures: 0 };
  const publish = (record: ReturnType<typeof collector.collect>, external = true) => {
    if (!record) return record;
    queue.enqueue({ key: `${source}:${++sequence}`, origin: "application", record });
    if (external) {
      const decision = telemetryExportDecision(record, configuration.exportSampling);
      if (decision === "export") counters.exportSelected++;
      else if (decision === "sampled-out") counters.sampledOut++;
      else counters.severityFiltered++;
      const exporter = options.exporter?.exportRecord ?? options.exportRecord;
      if (exporter) {
        const pending = Promise.resolve()
          .then(() => exporter(record, decision))
          .catch(() => {
            counters.exportFailures++;
          })
          .finally(() => exports.delete(pending));
        exports.add(pending);
      }
    }
    return record;
  };
  options.exporter?.setFailureHandler((failure) =>
    publish(collector.collectRequired(telemetryExporterDiagnostic(failure)), false),
  );
  const flush = async () => {
    await queue.flush();
    await Promise.all(exports);
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
    close: async () => {
      await flush();
      await options.exporter?.close();
      await queue.close();
      stream.close();
    },
  });
}
