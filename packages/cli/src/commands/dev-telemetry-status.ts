import { Effect, MutableRef, Ref, Schema } from "effect";
import { cliTry, cliPromise } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { telemetryProducerSchema } from "./dev-telemetry.schemas.js";

/**
 * Tracks per-producer snapshots under one telemetry lifetime.
 * @returns Native HTTP report Effect and a synchronous status snapshot callback.
 * @remarks Ref mutation stays in native callbacks/Effects; no state crosses sessions.
 */
export function collectProducerStatus() {
  const producers = Ref.makeUnsafe<ReadonlyMap<string, { failed: number; dropped: number }>>(
    new Map(),
  );
  return {
    report: (request: Request) =>
      observeCli(
        "dev.telemetry.producer-report",
        cliPromise("dev.telemetry.producer-json", () => request.json()).pipe(
          Effect.flatMap((value: unknown) =>
            cliTry("dev.telemetry.producer-schema", () => {
              const decoded = Schema.decodeUnknownSync(telemetryProducerSchema)(value);
              if (
                decoded.source.length > 128 ||
                !Number.isSafeInteger(decoded.failed) ||
                decoded.failed < 0 ||
                !Number.isSafeInteger(decoded.dropped) ||
                decoded.dropped < 0
              )
                throw new TypeError("Invalid producer status");
              MutableRef.update(producers.ref, (previous) =>
                new Map(previous).set(decoded.source, {
                  failed: decoded.failed,
                  dropped: decoded.dropped,
                }),
              );
              return Response.json({ ok: true });
            }),
          ),
          Effect.catchTag("CliAdapterError", () =>
            Effect.succeed(new Response("Invalid producer status", { status: 400 })),
          ),
        ),
      ),
    snapshot: () =>
      [...Ref.getUnsafe(producers).values()].reduce(
        (sum, value) => ({
          failed: sum.failed + value.failed,
          dropped: sum.dropped + value.dropped,
        }),
        { failed: 0, dropped: 0 },
      ),
  };
}
