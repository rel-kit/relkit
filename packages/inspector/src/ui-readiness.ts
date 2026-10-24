/** Requires complete UI response bytes and joins cancellation before advertising listening. */
import { Effect, Schedule } from "effect";
import { InspectionConnectionError } from "@relkit/inspector-api/connection";

/** The caller supplies native authority; expected connection failures retry within one minute. */
export function waitInspectorUiReady(probe: Effect.Effect<boolean, InspectionConnectionError>) {
  return probe.pipe(
    Effect.catchTag("InspectionConnectionError", () => Effect.succeed(false)),
    Effect.repeat({ until: (value) => value, schedule: Schedule.spaced(50) }),
    Effect.timeout(60_000),
    Effect.mapError((cause) => new InspectionConnectionError({ operation: "ui.not-ready", cause })),
  );
}

/** Fetch cancellation reaches both headers and body; an oversized UI reply is never ready. */
export function probeInspectorUi(fetcher: typeof fetch, endpoint: string) {
  return Effect.tryPromise({
    try: async (signal) => {
      const response = await fetcher(endpoint, { signal });
      const reader = response.body?.getReader();
      if (!reader) return response.ok;
      try {
        let bytes = 0;
        while (true) {
          const next = await reader.read();
          if (next.done) return response.ok;
          bytes += next.value.byteLength;
          if (bytes > 4_194_304) return false;
        }
      } finally {
        try {
          await reader.cancel();
        } catch {
          /* Keep the original probe outcome during native cancellation. */
        }
        reader.releaseLock();
      }
    },
    catch: (cause) =>
      new InspectionConnectionError({
        operation: "ui.probe",
        cause: cause instanceof Error ? cause : new Error("UI probe failed", { cause }),
      }),
  }).pipe(
    Effect.timeout(1000),
    Effect.mapError((cause) =>
      cause instanceof InspectionConnectionError
        ? cause
        : new InspectionConnectionError({ operation: "ui.probe-timeout", cause }),
    ),
  );
}
