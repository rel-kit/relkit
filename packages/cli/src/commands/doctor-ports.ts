/**
 * Checks backend and explicitly selected fixed bridge ports. Standalone UI
 * settings are outside application doctor ownership; ephemeral bridge ports are
 * allocated by their runtime owner. Every native probe closes before returning.
 */
import type { LoadedToolingConfig } from "@relkit/compiler";
import { Effect } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { availablePortEffect, doctorPromise } from "./doctor-native.js";
import { resolveApplicationPort } from "./ports.js";
import type { DoctorOptions } from "./doctor.types.js";

/**
 * Probes only the application's selected listeners, in backend-first order.
 * @param config - Validated application settings, if loading succeeded.
 * @param options - Backend port and captured invocation environment.
 * @param probe - Optional finite native test adapter.
 * @returns Lazy availability report after owned listener cleanup.
 */
export const checkPortsEffect = Effect.fn("Doctor.ports")(
  function* (
    config: LoadedToolingConfig | undefined,
    options: DoctorOptions,
    probe?: (port: number) => Promise<boolean>,
  ) {
    const resolved = yield* cliTry("doctor.ports.resolve", () =>
      resolvePorts(config, options),
    ).pipe(Effect.result);
    if (resolved._tag === "Failure")
      return { name: "ports", ok: false, message: resolved.failure.message };
    const { backend, inspector } = resolved.success;
    const details = { backend, ...(inspector === undefined ? {} : { inspector }) };
    if (inspector !== undefined && inspector !== 0 && backend === inspector)
      return {
        name: "ports",
        ok: false,
        message: "Configured backend and inspector bridge ports collide.",
        details,
      };
    const check = (port: number, host: string) =>
      probe === undefined
        ? availablePortEffect(port, host)
        : doctorPromise("doctor.injectedPort", () => probe(port));
    const backendAvailable = yield* check(backend, "127.0.0.1");
    const bridgeAvailable =
      inspector === undefined || inspector === 0
        ? true
        : yield* check(inspector, config?.inspector.connection.host ?? "127.0.0.1");
    const ok = backendAvailable && bridgeAvailable;
    return {
      name: "ports",
      ok,
      message: ok ? "Configured ports are available." : "A configured port is unavailable.",
      details,
    };
  },
  (effect) => observeCli("doctor.ports", effect),
);

/**
 * Resolves backend precedence independently from development bridge settings.
 * @param config - Validated bridge selection and backend default.
 * @param options - Backend flag and environment; legacy UI settings are ignored.
 * @returns Selected listener ports without acquiring a probe.
 */
function resolvePorts(config: LoadedToolingConfig | undefined, options: DoctorOptions) {
  return {
    backend: resolveApplicationPort({
      ...(options.backendPort === undefined ? {} : { flag: options.backendPort }),
      source: options.source ?? process.env,
      ...(config === undefined ? {} : { configured: config.server.port }),
    }),
    inspector: config?.inspector.enabled ? config.inspector.connection.port : undefined,
  };
}
