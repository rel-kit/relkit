/**
 * Provides dev diagnostics without persistent storage. Disabled inspection
 * acquires no listener or retention. Enabled producers use a private bounded
 * loopback ingress while the session bridge serves authenticated replay.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { Context, Effect, Layer, Ref } from "effect";
import { admitObservabilityRecord } from "@relkit/observability";
import {
  InspectionCapture,
  InspectionNative,
  InspectionNativeLive,
} from "@relkit/inspector-api/connection";
import type { InspectionNativeOperations } from "@relkit/inspector-api/connection";
import type { TelemetryConfiguration } from "@relkit/observability";
import { runExecutionSyncWith } from "@relkit/contracts/operation";
import { cliAdapterError } from "../cli-errors.js";
import type { DevCapture, DevCaptureOperations } from "./dev-capture.types.js";

/** Live/test transport is captured once; make performs no persistent I/O. */
export class CliDevCapture extends Context.Service<CliDevCapture, DevCaptureOperations>()(
  "relkit/cli/DevCapture",
  {
    make: Effect.gen(function* () {
      const native = yield* InspectionNative;
      return {
        acquire: (enabled, config) => acquireCapture(native, enabled, config),
      } satisfies DevCaptureOperations;
    }),
  },
) {}

/** Native command composition; tests can provide an alternative InspectionNative Layer. */
export const devCaptureLayer = Layer.effect(CliDevCapture, CliDevCapture.make).pipe(
  Layer.provide(InspectionNativeLive),
);

/** Creates callback projections, binding producer ingress only for explicit inspection. */
const acquireCapture = Effect.fn("Dev.capture")(function* (
  native: InspectionNativeOperations,
  enabled: boolean,
  configuration: TelemetryConfiguration,
) {
  const policy = yield* Ref.make(configuration);
  const captured = yield* Effect.context<never>();
  const capture = enabled
    ? yield* InspectionCapture.make(configuration).pipe(
        Effect.mapError((error) => cliAdapterError("dev.capture", error)),
      )
    : undefined;
  if (capture) yield* Effect.addFinalizer(() => capture.close);
  const source = randomUUID();
  let sequence = 0;
  const endpoint = capture ? yield* optionalIngress(native, capture) : undefined;
  return {
    environment: { RELKIT_TELEMETRY_URL: endpoint?.url, RELKIT_TELEMETRY_TOKEN: endpoint?.token },
    append: (record, origin = "relkit") => {
      if (!capture) return;
      runExecutionSyncWith(
        captured,
        capture
          .append(record, { key: `${source}:${++sequence}`, origin })
          .pipe(
            Effect.catchTag("InspectionConnectionError", () =>
              Effect.logWarning("Inspection record admission failed"),
            ),
          ),
      );
    },
    redact: (record) => redactCapturedLog(record, Ref.getUnsafe(policy)),
    configureEffect: (next) =>
      (capture?.configure(next) ?? Effect.void).pipe(
        Effect.mapError((error) => cliAdapterError("dev.capture.configure", error)),
        Effect.andThen(Ref.set(policy, next)),
      ),
    records: (request) =>
      capture?.records(request) ??
      Effect.succeed(new Response("Inspection disabled", { status: 503 })),
  } satisfies DevCapture;
});

/** Transport failure is diagnostic degradation; invalid configuration remains a startup error. */
const optionalIngress = Effect.fn("Dev.optionalCaptureIngress")(function* (
  native: InspectionNativeOperations,
  capture: import("@relkit/inspector-api/connection").InspectionCaptureOperations,
) {
  return yield* acquireIngress(native, capture.producer).pipe(
    Effect.catchTag("CliAdapterError", () =>
      capture.markIncomplete.pipe(
        Effect.andThen(
          Effect.logWarning(
            "Inspection capture ingress unavailable; backend logging remains active",
          ),
        ),
        Effect.as(undefined),
      ),
    ),
  );
});

/** Holds bounded authenticated producer ingress in the command's existing Scope. */
const acquireIngress = Effect.fn("Dev.captureIngress")(function* (
  native: InspectionNativeOperations,
  producer: import("@relkit/inspector-api/connection").InspectionCaptureOperations["producer"],
) {
  const token = randomBytes(32).toString("base64url");
  let host = "";
  const url = yield* native
    .listen({ host: "127.0.0.1", port: 0 }, (request) => {
      if (
        request.headers.has("origin") ||
        new URL(request.url).host !== host ||
        request.headers.get("authorization") !== `Bearer ${token}`
      )
        return Effect.succeed(new Response("Unauthorized", { status: 401 }));
      return producer(request).pipe(
        Effect.catchTag("InspectionConnectionError", () =>
          Effect.succeed(new Response("Invalid telemetry batch", { status: 400 })),
        ),
      );
    })
    .pipe(Effect.mapError((error) => cliAdapterError("dev.capture.listen", error)));
  host = new URL(url).host;
  return { url, token };
});

/** Keeps terminal log projection pure while capture resources remain with their owner. */
function redactCapturedLog(
  record: Parameters<DevCapture["redact"]>[0],
  config: TelemetryConfiguration,
): ReturnType<DevCapture["redact"]> {
  const safe = admitObservabilityRecord(record, config.redaction);
  return safe?.signal === "log"
    ? safe
    : {
        version: 2,
        signal: "log",
        timestamp: new Date().toISOString(),
        level: "warn",
        component: "relkit",
        message: "Invalid log record",
        fields: {},
      };
}
