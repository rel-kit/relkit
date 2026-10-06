import { Effect, Schema } from "effect";
import type { LocalRecord } from "@relkit/observability/local";
import { cliOriginalError, cliPromise, type CliAdapterError } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { telemetryBatchSchema, telemetryEnvelopeSchema } from "./dev-telemetry.schemas.js";
import { decodeTelemetry } from "./dev-telemetry-store.js";
import type { TelemetryStatus } from "./dev-telemetry.types.js";

/**
 * Routes the existing producer/storage paths before the owned Inspector router.
 * @param request - Native ingress request.
 * @param options - Captured domain operations and native router callback.
 * @returns Existing bounded response envelopes; private storage failures never escape HTTP.
 */
export const telemetryServeEffect = Effect.fn("DevTelemetry.serve")(
  function* (
    request: Request,
    options: {
      readonly report: (request: Request) => Effect.Effect<Response>;
      readonly status: () => TelemetryStatus;
      readonly append: (records: readonly LocalRecord[]) => Effect.Effect<void, CliAdapterError>;
      readonly flush: Effect.Effect<void>;
      readonly api: (request: Request) => Response | Promise<Response>;
    },
  ) {
    const path = new URL(request.url).pathname;
    if (path === "/producer-status" && request.method === "POST")
      return yield* options.report(request);
    if (path === "/_relkit/v1/storage")
      return Response.json(options.status(), { headers: { "x-relkit-api-version": "1" } });
    if (path === "/records" && request.method === "POST") {
      return yield* Effect.gen(function* () {
        const value: unknown = yield* cliPromise("dev.telemetry.records-json", () =>
          request.json(),
        );
        const batch = yield* decodeTelemetry(telemetryBatchSchema, value);
        if (batch.records.length > 256)
          return Response.json({ error: "Invalid batch" }, { status: 400 });
        const records = yield* decodeTelemetry(
          Schema.Array(telemetryEnvelopeSchema),
          batch.records,
        );
        yield* options.append(records);
        return Response.json({ ok: true });
      }).pipe(
        Effect.catchTag("CliAdapterError", (error) => {
          const reason = cliOriginalError(error);
          return Effect.succeed(
            Response.json(
              {
                error:
                  reason instanceof TypeError ? "Invalid telemetry record" : "Storage unavailable",
              },
              { status: reason instanceof TypeError || reason instanceof SyntaxError ? 400 : 503 },
            ),
          );
        }),
      );
    }
    yield* options.flush;
    return yield* cliPromise("dev.telemetry.inspector-request", () =>
      Promise.resolve(options.api(request)),
    );
  },
  (effect) => observeCli("dev.telemetry.serve", effect),
);

/**
 * Checks the existing public Inspector path and optional internal bearer policy.
 * @param request - Native request before a domain query is started.
 * @returns Undefined for other paths, false for denied access, true for an admitted query.
 */
export function telemetryRequestAccess(request: Request): boolean | undefined {
  if (
    request.method !== "GET" ||
    !/^\/_relkit\/v1\/(logs|requests|traces|stream|storage)(\/|$)/.test(
      new URL(request.url).pathname,
    )
  )
    return;
  const bearer = process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN;
  return bearer === undefined || request.headers.get("authorization") === `Bearer ${bearer}`;
}

/**
 * Creates the established unauthorized Inspector response without private diagnostics.
 * @returns Existing protocol/version/code and HTTP status.
 */
export function telemetryUnauthorized(): Response {
  return Response.json(
    { protocol: "relkit.inspector", version: 1, error: "RELKIT_OBSERVABILITY_UNAUTHORIZED" },
    { status: 401, headers: { "x-relkit-api-version": "1" } },
  );
}
