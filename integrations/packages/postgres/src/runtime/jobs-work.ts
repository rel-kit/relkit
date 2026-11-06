/**
 * Builds the execution envelope and binding the task executor receives for a
 * leased run. The binding's signal belongs to the lease: the worker aborts it
 * when a cancellation is requested or the lease is lost. Pure construction; the
 * worker owns the controller and heartbeat.
 */
import type {
  OperationContext,
  TaskExecutionBinding,
  TaskExecutionEnvelope,
} from "relkit/jobs/adapter";
import { iso } from "./jobs-rows.js";
import type { JobRunRow } from "./jobs-rows.types.js";

/**
 * Projects a leased row to the executor envelope.
 * @param row - Row returned by the lease claim.
 * @returns The envelope with the canonical input and run identity.
 */
export function envelopeOf(row: JobRunRow): TaskExecutionEnvelope {
  const request = row.request;
  return Object.freeze({
    runId: row.run_id,
    jobId: row.job_id,
    taskId: row.task_id,
    taskVersion: row.task_version,
    buildId: row.build_id,
    input: row.input,
    acceptedAt: iso(row.accepted_at),
    attempt: row.attempt,
    scope: row.scope,
    ...(request.inputHash === undefined ? {} : { inputHash: request.inputHash }),
    ...(request.inputSchemaHash === undefined ? {} : { inputSchemaHash: request.inputSchemaHash }),
    ...(request.scheduledFor === undefined ? {} : { scheduledFor: request.scheduledFor }),
    ...(request.parentRunId === undefined ? {} : { parentRunId: request.parentRunId }),
    ...(request.acceptanceIdentity === undefined
      ? {}
      : { acceptanceIdentity: request.acceptanceIdentity }),
    ...(request.occurrenceIdentity === undefined
      ? {}
      : { occurrenceIdentity: request.occurrenceIdentity }),
    ...(request.propagation === undefined ? {} : { propagation: request.propagation }),
  });
}

/**
 * Builds the binding for one attempt.
 * @param row - Leased row.
 * @param signal - Lease-owned abort signal.
 * @param context - Worker operation context.
 * @returns The binding without durable sleep (unsupported on this backend).
 */
export function bindingOf(
  row: JobRunRow,
  signal: AbortSignal,
  context: OperationContext,
): TaskExecutionBinding {
  const envelope = envelopeOf(row);
  const { input: _input, inputHash: _hash, ...run } = envelope;
  return Object.freeze({
    run: {
      ...run,
      service: context.service,
      serviceGeneration: row.request.serviceGeneration ?? context.serviceGeneration,
    },
    signal,
  });
}
