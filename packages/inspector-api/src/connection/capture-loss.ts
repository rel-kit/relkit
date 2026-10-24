/** Coalesces cumulative producer failures without retaining application payloads. */
import { Effect, Ref, Schema } from "effect";
import type { InspectionCaptureOperations } from "./capture.types.js";
import { InspectionConnectionError } from "./connection-error.js";
import { readInspectionBody } from "./bridge-body.js";

const counter = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
const report = Schema.fromJsonString(
  Schema.Struct({
    source: Schema.String.check(Schema.isUUID()),
    failed: counter,
    dropped: counter,
  }),
);

/** Independent cumulative counters survive ACKs; one warning per bounded producer source. */
export const makeCaptureLoss = Effect.fn("Inspection.captureLoss")(function* (
  append: InspectionCaptureOperations["append"],
) {
  const sources = new Map<string, { failed: number; dropped: number }>();
  const status = yield* Ref.make({
    producerFailed: 0,
    producerDropped: 0,
    producerSourcesExceeded: false,
  });
  return {
    status: Ref.get(status),
    report: (request: Request) =>
      Effect.gen(function* () {
        const bytes = yield* readInspectionBody(request);
        const input = yield* Schema.decodeUnknownEffect(report)(
          new TextDecoder().decode(bytes),
        ).pipe(
          Effect.mapError(
            (cause) => new InspectionConnectionError({ operation: "body.producer-status", cause }),
          ),
        );
        const previous = sources.get(input.source);
        if (!previous && sources.size === 256) {
          yield* Ref.update(status, (value) => ({ ...value, producerSourcesExceeded: true }));
          return Response.json({ ok: true, incomplete: true });
        }
        const failed = Math.max(previous?.failed ?? 0, input.failed);
        const dropped = Math.max(previous?.dropped ?? 0, input.dropped);
        sources.set(input.source, { failed, dropped });
        yield* Ref.update(status, (value) => ({
          ...value,
          producerFailed: Math.min(
            Number.MAX_SAFE_INTEGER,
            value.producerFailed + failed - (previous?.failed ?? 0),
          ),
          producerDropped: Math.min(
            Number.MAX_SAFE_INTEGER,
            value.producerDropped + dropped - (previous?.dropped ?? 0),
          ),
        }));
        if (
          (previous === undefined || previous.failed + previous.dropped === 0) &&
          failed + dropped > 0
        )
          yield* producerLossWarning(append, input.source);
        return Response.json({ ok: true });
      }),
  };
});

/** Warning admission occurs only on a producer's first nonzero report. */
function producerLossWarning(append: InspectionCaptureOperations["append"], source: string) {
  return append(
    {
      version: 2,
      signal: "log",
      timestamp: new Date().toISOString(),
      level: "warn",
      component: "relkit",
      message: "Application inspection delivery is incomplete",
      fields: {},
    },
    { key: `producer-loss:${source}`, origin: "relkit" },
  );
}
