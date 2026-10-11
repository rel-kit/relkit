/**
 * Projects session retention into existing native logger and inspector callbacks.
 * Shared state belongs to one acquired relay. Configuration and support methods
 * remain observed Effect operations; callback edges never own resource lifetimes.
 */
import { Effect, Ref } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { admitObservabilityRecord } from "@relkit/observability";
import {
  normalizeTelemetryConfigurationEffect,
  type TelemetryConfiguration,
} from "@relkit/observability/telemetry";
import { cliAdapterError } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { appendRelayRecord } from "./dev-telemetry-relay-ingress.js";
import { runTelemetryHandoff } from "./dev-telemetry-relay-handoff.js";
import { telemetryRelayStatus } from "./dev-telemetry-relay-status.js";
import { handleEarlyInspector } from "./dev-telemetry-relay-query.js";
import type { DevTelemetryRelay, DevTelemetryRelayState } from "./dev-telemetry-relay.types.js";
import type { TelemetryStorageOperations } from "./dev-telemetry-storage.types.js";

/**
 * Creates native callbacks borrowing only one already acquired session state.
 * @param state - Current configuration, canonical projection and bounded buffer.
 * @param storage - Captured delayed persistent authority.
 * @param url - Actual authenticated loopback ingress URL.
 * @returns Callback facade; running support still requires the session's Effect Scope.
 */
export function telemetryRelayCallbacks(
  state: DevTelemetryRelayState,
  storage: TelemetryStorageOperations,
  url: string,
): DevTelemetryRelay {
  return {
    environment: { RELKIT_TELEMETRY_URL: url, RELKIT_TELEMETRY_TOKEN: state.token },
    append: (record, origin) => appendRelayRecord(state, record, origin),
    redact: (record) => {
      const safe = admitObservabilityRecord(record, Ref.getUnsafe(state.configuration).redaction);
      if (safe?.signal === "log") return safe;
      return {
        version: 2,
        signal: "log",
        timestamp: new Date().toISOString(),
        level: "warn",
        component: "relkit",
        message: "Invalid log record",
        fields: {},
      };
    },
    handle: (request) => handleInspector(state, request),
    closeStream: () => Ref.getUnsafe(state.store)?.closeStream(),
    configureEffect: (next) => configureRelay(state, next),
    run: (log) => runTelemetryHandoff(state, storage, log),
  };
}

/**
 * Preserves public inspector admission while providing explicit pending status.
 * @param state - Session storage projection and bounded early counters.
 * @param request - Native proxy ingress.
 * @returns Existing canonical handler or a pending response for recognized query paths.
 */
function handleInspector(
  state: DevTelemetryRelayState,
  request: Request,
): Promise<Response> | undefined {
  if (
    request.method !== "GET" ||
    !/^\/_relkit\/v1\/(logs|requests|traces|stream|storage)(\/|$)/.test(
      new URL(request.url).pathname,
    )
  )
    return;
  const bearer = process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN;
  if (bearer !== undefined && request.headers.get("authorization") !== `Bearer ${bearer}`)
    return Promise.resolve(
      Response.json(
        {
          protocol: "relkit.inspector",
          version: 1,
          error: "RELKIT_OBSERVABILITY_UNAUTHORIZED",
        },
        { status: 401, headers: { "x-relkit-api-version": "1" } },
      ),
    );
  const store = Ref.getUnsafe(state.store);
  if (new URL(request.url).pathname === "/_relkit/v1/storage") return telemetryRelayStatus(state);
  if (store === undefined) return handleEarlyInspector(state, request);
  if (store !== undefined) return store.handle(request);
}

/**
 * Updates current capture/redaction policy and the acquired canonical store if present.
 * @param state - Session-owned current configuration.
 * @param next - Compiler-accepted telemetry configuration for a safe generation.
 * @returns Validated configuration receipt; failed persistence preserves the prior policy.
 */
const configureRelay = Effect.fn("DevTelemetry.configureRelay")(
  (state: DevTelemetryRelayState, next: TelemetryConfiguration) =>
    observeCli(
      "dev.telemetry.configure-relay",
      Effect.gen(function* () {
        const normalized = yield* normalizeTelemetryConfigurationEffect(next).pipe(
          mapErrorCause((error) => cliAdapterError("dev.telemetry.configuration", error)),
        );
        const store = Ref.getUnsafe(state.store);
        if (store !== undefined) yield* store.configureEffect(normalized);
        yield* state.buffer
          .configure({
            ...(normalized.localRetention?.maxRecords === undefined
              ? {}
              : { maxRecords: normalized.localRetention.maxRecords }),
            ...(normalized.localRetention?.maxBytes === undefined
              ? {}
              : { maxBytes: normalized.localRetention.maxBytes }),
          })
          .pipe(mapErrorCause((error) => cliAdapterError("dev.telemetry.early-policy", error)));
        yield* Ref.set(state.configuration, normalized);
      }).pipe(state.configurationGate.withPermit),
    ),
);
