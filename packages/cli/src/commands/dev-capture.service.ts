/**
 * Provides dev diagnostics without persistent storage. A session that starts
 * disabled holds no listener or retention; enabling it mid-session opens both on
 * demand. Retention is then kept for the session so its record sequence keeps
 * advancing under the stable bridge identity, while disabling closes the private
 * bounded loopback ingress and stops admission and replay.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { Context, Effect, Exit, Layer, Ref, Scope, Semaphore } from "effect";
import { admitObservabilityRecord } from "@relkit/observability";
import {
  InspectionCapture,
  InspectionNative,
  InspectionNativeLive,
} from "@relkit/inspector-api/connection";
import type {
  InspectionCaptureOperations,
  InspectionNativeOperations,
} from "@relkit/inspector-api/connection";
import type { TelemetryConfiguration } from "@relkit/observability";
import { runExecutionSyncWith } from "@relkit/contracts/operation";
import { cliAdapterError } from "../cli-errors.js";
import type { DevCapture, DevCaptureOperations } from "./dev-capture.types.js";

/** Removes inherited producer credentials from generations built without inspection. */
export const DISABLED_CAPTURE_ENVIRONMENT = Object.freeze({
  RELKIT_TELEMETRY_URL: undefined,
  RELKIT_TELEMETRY_TOKEN: undefined,
});

/** One enabled capture and the child Scope that releases its producer ingress. */
interface OwnedCapture {
  readonly capture: InspectionCaptureOperations;
  readonly environment: DevCapture["environment"];
  readonly scope: Scope.Closeable;
}

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

/** Creates callback projections; producer ingress is bound only while inspection is enabled. */
const acquireCapture = Effect.fn("Dev.capture")(function* (
  native: InspectionNativeOperations,
  enabled: boolean,
  configuration: TelemetryConfiguration,
) {
  const policy = yield* Ref.make(configuration);
  const captured = yield* Effect.context<never>();
  const parent = yield* Scope.Scope;
  // Session-lifetime retention; replay cursors and keys are per session and sequence.
  const retained = yield* Ref.make<InspectionCaptureOperations | undefined>(undefined);
  const owned = yield* Ref.make<OwnedCapture | undefined>(undefined);
  const serial = yield* Semaphore.make(1);
  const source = randomUUID();
  let sequence = 0;
  const enableEffect = serial.withPermits(1)(
    Effect.gen(function* () {
      const current = yield* Ref.get(owned);
      if (current) return current.environment;
      const capture =
        (yield* Ref.get(retained)) ??
        (yield* openCapture(yield* Ref.get(policy)).pipe(
          Effect.provideService(Scope.Scope, parent),
          Effect.tap((opened) => Ref.set(retained, opened)),
        ));
      const scope = yield* Scope.fork(parent);
      const endpoint = yield* optionalIngress(native, capture).pipe(
        Effect.provideService(Scope.Scope, scope),
        Effect.onError(() => Scope.close(scope, Exit.void)),
      );
      const environment = {
        RELKIT_TELEMETRY_URL: endpoint?.url,
        RELKIT_TELEMETRY_TOKEN: endpoint?.token,
      };
      yield* Ref.set(owned, { capture, environment, scope });
      return environment;
    }),
  );
  const disableEffect = serial.withPermits(1)(
    Ref.getAndSet(owned, undefined).pipe(
      Effect.flatMap((current) =>
        current === undefined ? Effect.void : Scope.close(current.scope, Exit.void),
      ),
    ),
  );
  const environment = enabled ? yield* enableEffect : DISABLED_CAPTURE_ENVIRONMENT;
  return {
    environment,
    append: (record, origin = "relkit") => {
      const capture = Ref.getUnsafe(owned)?.capture;
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
      Effect.suspend(() => Ref.getUnsafe(retained)?.configure(next) ?? Effect.void).pipe(
        Effect.mapError((error) => cliAdapterError("dev.capture.configure", error)),
        Effect.andThen(Ref.set(policy, next)),
      ),
    records: (request) =>
      Ref.getUnsafe(owned)?.capture.records(request) ??
      Effect.succeed(new Response("Inspection disabled", { status: 503 })),
    enableEffect,
    disableEffect,
  } satisfies DevCapture;
});

/** Opens the session's bounded capture, released with the caller's Scope. */
const openCapture = Effect.fn("Dev.openCapture")(function* (configuration: TelemetryConfiguration) {
  const capture = yield* InspectionCapture.make(configuration).pipe(
    Effect.mapError((error) => cliAdapterError("dev.capture", error)),
  );
  yield* Effect.addFinalizer(() => capture.close);
  return capture;
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
