/** Validates native IPC payloads through the shared model/query owner before exposing browser data. */
import { Effect, Schema } from "effect";
import {
  telemetryImportSchema,
  telemetryStoredSchema,
  telemetryLogsSchema,
  telemetryRequestsSchema,
  telemetryTracesSchema,
  telemetryLogDetailSchema,
  telemetryRequestDetailSchema,
  telemetryTraceDetailSchema,
} from "@relkit/observability/local/protocol";
import type { LocalWorkerCommand } from "@relkit/observability/local/worker-contract";
import { InspectionConnectionError } from "@relkit/inspector-api/connection";

/** A transport-level JSON decode alone cannot certify a worker query response. */
export function validateHistoryReply(command: LocalWorkerCommand, value: Schema.Json | undefined) {
  switch (command.type) {
    case "open":
      return validate(telemetryImportSchema, value);
    case "append":
      return validate(Schema.Array(telemetryStoredSchema), value);
    case "query":
      return validate(queryCodecs[command.kind], value);
    case "detail":
      return validate(detailCodecs[command.kind], value);
    default:
      return validate(Schema.Undefined, value);
  }
}

const queryCodecs = {
  logs: telemetryLogsSchema,
  requests: telemetryRequestsSchema,
  traces: telemetryTracesSchema,
};
const detailCodecs = {
  log: telemetryLogDetailSchema,
  request: telemetryRequestDetailSchema,
  trace: telemetryTraceDetailSchema,
};

/** Converts only codec failures, preserving native worker failures in their owning channel. */
function validate<S extends Schema.Top & { readonly DecodingServices: never }>(
  codec: S,
  value: Schema.Json | undefined,
) {
  return Schema.decodeUnknownEffect(codec)(value).pipe(
    Effect.asVoid,
    Effect.mapError(
      (cause) => new InspectionConnectionError({ operation: "history.invalid-reply", cause }),
    ),
  );
}
