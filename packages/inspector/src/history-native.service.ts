/** Acquires the optional isolated writer and validates its opening receipt before exposing it. */
import { Cause, Context, Effect, Layer, Schema } from "effect";
import { startLocalWorkerEffect } from "@relkit/observability-local/worker";
import { telemetryImportSchema } from "@relkit/observability/local/protocol";
import { InspectionConnectionError } from "@relkit/inspector-api/connection";
import { LocalWorkerError } from "@relkit/observability/local/worker-contract";
import { bindInspectorHistory } from "./history-binding.js";
import type { InspectorHistoryNativeOperations } from "./history-native.types.js";

/** Tests substitute the complete native boundary without inheriting live process authority. */
export class InspectorHistoryNative extends Context.Service<
  InspectorHistoryNative,
  InspectorHistoryNativeOperations
>()("relkit/inspector/HistoryNative", {
  make: Effect.sync(() => ({ acquire: acquireNative }) satisfies InspectorHistoryNativeOperations),
}) {}

/** Native worker module is owned exclusively by the standalone tool. */
export const InspectorHistoryNativeLive = Layer.effect(
  InspectorHistoryNative,
  InspectorHistoryNative.make,
);

/** Keeps partial opening and every shutdown outcome inside the caller's Scope. */
const acquireNative = Effect.fn("Inspector.acquireNativeHistory")(function* (
  root: string,
  projectId: string,
) {
  yield* bindInspectorHistory(root, projectId);
  const worker = yield* Effect.acquireRelease(
    startLocalWorkerEffect().pipe(
      Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, historyNativeFailure))),
    ),
    (worker) =>
      worker
        .close()
        .pipe(
          Effect.catchTag("LocalWorkerError", () =>
            Effect.logWarning("Inspection history flush incomplete; existing data preserved"),
          ),
        ),
  );
  yield* worker.call({ type: "open", root }).pipe(
    Effect.timeout(10_000),
    Effect.flatMap(Schema.decodeUnknownEffect(telemetryImportSchema)),
    Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, historyNativeFailure))),
  );
  return worker;
});

/** Retains precise native failure evidence without exposing native payloads to browser responses. */
export function historyNativeFailure<Cause extends Error>(cause: Cause): InspectionConnectionError {
  const queryCode =
    cause instanceof LocalWorkerError && cause.reason === "response" ? cause.code : undefined;
  return new InspectionConnectionError({
    operation:
      queryCode ??
      (/Could not set lock|Conflicting lock/i.test(cause.message)
        ? "history.writer-conflict"
        : "history.unavailable"),
    cause,
  });
}
