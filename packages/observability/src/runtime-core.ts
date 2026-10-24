/**
 * Composes collectors, bounded memory or explicitly injected storage, and exports.
 * Default application logging never opens local history; CLI inspection selects
 * its native store separately and remote application telemetry keeps its transport.
 */
import { createRemoteObservabilityRuntime } from "./remote-runtime.js";
import { createObservabilityCollector } from "./collector.js";
import { createObservabilityStream } from "./stream.js";
import { createMemoryRuntimeStorage } from "./memory-storage.js";
import { normalizeTelemetryConfiguration } from "./telemetry-config.js";
import { runtimeQuery } from "./runtime-query.js";
import {
  initializeRuntimePipeline,
  persistRuntimeRecord,
  flushRuntimePipeline,
  closeRuntimePipeline,
} from "./runtime-pipeline.js";
import type { RuntimePipelineState } from "./runtime-pipeline.types.js";
import type { ObservabilityRecord } from "./model.js";
import type { ObservabilityRuntimeOptions } from "./runtime.types.js";

/**
 * Selects remote transport or explicitly injected/local memory capabilities.
 * @param options - Capture, export and storage configuration.
 * @returns A runtime handle whose close owns all acquired support resources.
 */
async function createObservabilityRuntime(options: ObservabilityRuntimeOptions = {}) {
  if (options.remote !== undefined)
    return createRemoteObservabilityRuntime(options, options.remote);
  const state = createRuntimeState(options);
  try {
    await initializeRuntimePipeline(state);
  } catch (error) {
    await closeRuntimePipeline(state).catch(() => undefined);
    throw error;
  }
  return runtimeHandle(state);
}

/** @param options - Unnormalized caller policy. @returns Owned resources with explicit storage selection and bounded collector defaults. */
function createRuntimeState(options: ObservabilityRuntimeOptions): RuntimePipelineState {
  const configuration = normalizeTelemetryConfiguration(options.configuration);
  const redaction = options.redaction ?? configuration.redaction;
  const maxRecords = options.maxRecords ?? configuration.localRetention?.maxRecords;
  const signals = options.signals ?? configuration.capture?.signals;
  const collector = createObservabilityCollector({
    ...(maxRecords === undefined ? {} : { maxRecords }),
    ...(redaction === undefined ? {} : { redaction }),
    ...(signals === undefined ? {} : { signals }),
  });
  const normalized = { ...options, configuration };
  const store = options.storage ?? createMemoryRuntimeStorage(normalized);
  const stream = createObservabilityStream(redaction === undefined ? {} : { redaction });
  return {
    collector,
    store,
    stream,
    options: normalized,
    pending: new Set(),
    directExport: undefined,
    persistFailure: undefined,
    closePromise: undefined,
    counters: {
      persisted: 0,
      streamed: 0,
      exportSelected: 0,
      sampledOut: 0,
      severityFiltered: 0,
      exportFailures: 0,
    },
  };
}

/** @param state - Runtime-owned acquired state. @returns The established collector/query/export compatibility surface. */
function runtimeHandle(state: RuntimePipelineState) {
  const { collector, stream } = state;
  const flush = () => flushRuntimePipeline(state);
  return Object.freeze({
    protocol: collector.protocol,
    version: collector.version,
    collect: (record: ObservabilityRecord) => {
      const admitted = collector.collect(record);
      persistRuntimeRecord(state, admitted);
      return admitted;
    },
    emit: <Event>(event: Event) => {
      const admitted = collector.emit(event);
      persistRuntimeRecord(state, admitted);
      return admitted;
    },
    read: collector.read,
    readRecords: collector.read,
    capture: collector.capture,
    query: runtimeQuery(state.store.query, flush),
    stream,
    exporterStats: () => state.options.exporter?.stats() ?? Object.freeze([]),
    exportCounters: () => Object.freeze({ ...state.counters }),
    flush,
    close: () => closeRuntimePipeline(state),
  });
}

export const runtimeCore = { createObservabilityRuntime };
