/**
 * Delivers admitted records to explicitly selected storage, streams and exporters.
 * Append failure remains visible through flush; close attempts every owned release.
 */
import { Effect } from "effect";
import { makeDirectExportEffect } from "./direct-export.js";
import { streamType } from "./runtime-stream-type.js";
import { telemetryExporterDiagnostic } from "./telemetry-exporter-diagnostic.js";
import { telemetryExportDecision } from "./telemetry-sampling.js";
import { releaseResources } from "./resource-release.js";
import type { RuntimePipelineState } from "./runtime-pipeline.types.js";
import type { RedactedObservabilityRecord } from "./record-admission.js";

/** @param state - Acquired runtime resources. @returns Completion after exporter setup and diagnostic handler registration. */
export async function initializeRuntimePipeline(state: RuntimePipelineState): Promise<void> {
  const exportRecord = state.options.exporter?.exportRecord ?? state.options.exportRecord;
  if (exportRecord !== undefined)
    state.directExport = await Effect.runPromise(
      makeDirectExportEffect(exportRecord, () => {
        state.counters.exportFailures += 1;
      }),
    );
  state.options.exporter?.setFailureHandler((failure) =>
    persistRuntimeRecord(
      state,
      state.collector.collectRequired(telemetryExporterDiagnostic(failure)),
      false,
    ),
  );
}

/** @param state - Runtime resources. @param record - Admitted record or capture omission. @param external - Whether exporter delivery is allowed. @returns Nothing after scheduling the owned write. */
export function persistRuntimeRecord(
  state: RuntimePipelineState,
  record: RedactedObservabilityRecord | undefined,
  external = true,
): void {
  if (record === undefined) return;
  const write = state.store
    .append(record)
    .then((persisted) => {
      if (persisted !== undefined) deliverRuntimeRecord(state, persisted, external);
    })
    .catch((cause) => {
      state.persistFailure ??= cause instanceof Error ? cause : new Error(String(cause), { cause });
    })
    .finally(() => state.pending.delete(write));
  state.pending.add(write);
}

/** @param state - Runtime resources. @param record - Successfully retained record. @param external - Export permission. @returns Nothing after independent stream/export delivery. */
function deliverRuntimeRecord(
  state: RuntimePipelineState,
  record: RedactedObservabilityRecord,
  external: boolean,
): void {
  state.counters.persisted += 1;
  const type = streamType(record);
  if (type !== undefined) {
    state.stream.publishRecord(type, record);
    state.counters.streamed += 1;
  }
  if (!external) return;
  const decision = telemetryExportDecision(record, state.options.configuration?.exportSampling);
  if (decision === "export") state.counters.exportSelected += 1;
  else if (decision === "sampled-out") state.counters.sampledOut += 1;
  else state.counters.severityFiltered += 1;
  if (state.directExport !== undefined)
    Effect.runSync(state.directExport.enqueue({ record, decision }));
}

/** @param state - Runtime resources. @returns Completion after accepted writes and their storage flush. */
export async function flushRuntimeStorage(state: RuntimePipelineState): Promise<void> {
  await Promise.all([...state.pending]);
  if (state.persistFailure) throw state.persistFailure;
  await state.store.flush();
}

/** @param state - Runtime resources. @returns Completion after local and exporter flushes, preserving failure. */
export async function flushRuntimePipeline(state: RuntimePipelineState): Promise<void> {
  await flushRuntimeStorage(state);
  if (state.directExport !== undefined)
    await Effect.runPromise(
      state.directExport.flush().pipe(Effect.mapError((error) => error.cause)),
    );
  await state.options.exporter?.flush();
  await flushRuntimeStorage(state);
}

/** @param state - Runtime resources. @returns The exactly-once release outcome after all cleanup actions run. */
export function closeRuntimePipeline(state: RuntimePipelineState): Promise<void> {
  state.closePromise ??= releaseResources([
    () => flushRuntimePipeline(state),
    () =>
      state.directExport === undefined
        ? undefined
        : Effect.runPromise(
            state.directExport.close().pipe(Effect.mapError((error) => error.cause)),
          ),
    () => state.options.exporter?.close(),
    () => flushRuntimeStorage(state),
    () => state.stream.close(),
    () => state.store.close(),
  ]);
  return state.closePromise;
}
