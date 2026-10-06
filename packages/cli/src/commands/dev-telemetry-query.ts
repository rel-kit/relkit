import { Effect, type Context } from "effect";
import { runExecutionPromiseWith } from "@relkit/contracts/operation";
import type { ObservabilityQuery } from "@relkit/observability";
import type { LocalWorkerCommand, LocalWorkerEffects } from "@relkit/observability/local";
import { cliOriginalError } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { telemetryWorkerCall } from "./dev-telemetry-native.service.js";
import { decodeTelemetry } from "./dev-telemetry-store.js";
import {
  telemetryLogsSchema,
  telemetryRequestsSchema,
  telemetryTracesSchema,
  telemetryLogDetailSchema,
  telemetryRequestDetailSchema,
  telemetryTraceDetailSchema,
} from "./dev-telemetry-query.schemas.js";
import type { Schema } from "effect";

/**
 * Builds existing query Promise edges around one captured worker and execution context.
 * @typeParam R - Services already owned by the telemetry scope.
 * @param worker - Native worker authority; replies require Schema validation.
 * @param context - Existing services; no callback acquires another runtime.
 * @returns The original query API, with all IPC responses validated before exposure.
 */
export function telemetryQuery<R>(
  worker: LocalWorkerEffects,
  context: Context.Context<R>,
): ObservabilityQuery {
  const query = <S extends Schema.Top & { readonly DecodingServices: never }>(
    command: LocalWorkerCommand,
    schema: S,
  ) =>
    runExecutionPromiseWith(
      context,
      observeCli(
        "dev.telemetry.query",
        telemetryWorkerCall(worker, command).pipe(
          Effect.flatMap((value) => decodeTelemetry(schema, value)),
          Effect.mapError(cliOriginalError),
        ),
      ),
    );
  return {
    logs: (filters = {}) =>
      query({ type: "query", kind: "logs", query: filters }, telemetryLogsSchema),
    requests: (filters = {}) =>
      query({ type: "query", kind: "requests", query: filters }, telemetryRequestsSchema),
    traces: (filters = {}) =>
      query({ type: "query", kind: "traces", query: filters }, telemetryTracesSchema),
    log: (id) => query({ type: "detail", kind: "log", id }, telemetryLogDetailSchema),
    request: (id) => query({ type: "detail", kind: "request", id }, telemetryRequestDetailSchema),
    trace: (id) => query({ type: "detail", kind: "trace", id }, telemetryTraceDetailSchema),
  };
}
