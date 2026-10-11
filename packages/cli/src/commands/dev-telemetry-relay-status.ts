/**
 * Projects early retention and canonical storage into explicit query readiness.
 * Pending and degraded responses retain cumulative loss independently of buffer
 * eviction. Native callbacks use their existing owner context and logger policy.
 */
import { Effect, Ref } from "effect";
import { runExecutionPromiseWith } from "@relkit/contracts/operation";
import { observeCli } from "../cli-runtime.js";
import type { DevTelemetryRelayState } from "./dev-telemetry-relay.types.js";

/**
 * Returns current buffered/loss counters beside canonical persistence status.
 * @param state - Acquired session state; no request Context is captured globally.
 * @returns Explicit incomplete response while support starts or records remain buffered.
 */
export function telemetryRelayStatus(state: DevTelemetryRelayState): Promise<Response> {
  return runExecutionPromiseWith(
    state.context,
    observeCli(
      "dev.telemetry.relay-status",
      Effect.gen(function* () {
        const early = yield* state.buffer.status();
        const store = Ref.getUnsafe(state.store);
        const canonical = store?.status();
        const storageState = Ref.getUnsafe(state.storageState);
        const pending = store === undefined;
        const error =
          canonical?.error ??
          (storageState === "unavailable"
            ? "Telemetry storage is unavailable"
            : "Telemetry storage is starting");
        return Response.json(
          {
            ...canonical,
            protocol: "relkit.observability.query",
            version: 1,
            state: pending || early.incomplete ? "degraded" : canonical?.state,
            error: pending ? error : canonical?.error,
            persisted: canonical?.persisted ?? 0,
            failed: canonical?.failed ?? 0,
            dropped: (canonical?.dropped ?? 0) + early.droppedRecords,
            ...early,
            incomplete: pending || early.incomplete || early.bufferedRecords > 0,
            storageState,
          },
          { status: pending ? 503 : 200, headers: { "x-relkit-api-version": "1" } },
        );
      }),
    ),
  );
}
