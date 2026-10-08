import { Context, Effect, Layer } from "effect";
import { cliAdapterError, cliOriginalError, cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliProcess, processLayer } from "../services/process.service.js";
import type { PortProbeOperations } from "./port-availability.types.js";

/** Native listener probing with scoped subprocess authority for occupied-port details. */
export class CliPortProbe extends Context.Service<CliPortProbe, PortProbeOperations>()(
  "relkit/cli/PortProbe",
) {}

/**
 * Captures process authority; every finite probe owns and closes its own listener.
 * @returns A Layer requiring CliProcess without starting listeners during acquisition.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * await Effect.runPromise(CliPortProbe.use((probe) => probe.check(0, "127.0.0.1", "--port")).pipe(Effect.provide(portProbeLayer)));
 * ```
 */
export const portProbeLive = Layer.effect(
  CliPortProbe,
  Effect.gen(function* () {
    const processes = yield* CliProcess;
    return CliPortProbe.of({
      check: Effect.fn("PortProbe.check")(
        function* (port, hostname, override) {
          if (port === 0) return;
          return yield* Effect.scoped(
            Effect.gen(function* () {
              yield* Effect.acquireRelease(
                cliTry("port.bind", () =>
                  Bun.serve({ hostname, port, fetch: () => new Response() }),
                ),
                (probe) =>
                  cliPromise("port.close", async () => {
                    await probe.stop(true);
                  }).pipe(
                    // A failed close is the probe's primary failure, since availability requires a closed listener.
                    Effect.catch((error) => Effect.die(cliOriginalError(error))),
                  ),
              );
            }),
          ).pipe(
            Effect.catchTag("CliAdapterError", (error) =>
              Effect.gen(function* () {
                const original = cliOriginalError(error);
                if (!isAddressInUse(original)) return yield* Effect.fail(error);
                const owner = yield* processes
                  .run({
                    command: "lsof",
                    args: ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"],
                    cwd: process.cwd(),
                    maximumOutputBytes: 65_536,
                  })
                  .pipe(
                    Effect.map((result) =>
                      result.exitCode === 0
                        ? listeningOwner(result.stdout)
                        : "another process (PID unavailable)",
                    ),
                    Effect.catchTag("CliAdapterError", () =>
                      Effect.succeed("another process (PID unavailable)"),
                    ),
                  );
                return yield* Effect.fail(
                  cliAdapterError(
                    "port.occupied",
                    new Error(
                      `Port ${port} on ${hostname} is already in use by ${owner}. Stop it or choose another with ${override}.`,
                      { cause: original },
                    ),
                  ),
                );
              }),
            ),
          );
        },
        (effect) => observeCli("port.check", effect),
      ),
    });
  }),
);

/** Explicit finite port dependency graph. */
export const portProbeLayer = portProbeLive.pipe(Layer.provide(processLayer));

/**
 * Projects only the process label and PID from native lsof output.
 * @param output - Captured native listing.
 * @returns Existing occupied-port owner text, falling back when no row is available.
 */
function listeningOwner(output: string): string {
  const columns = output.trim().split(/\r?\n/)[1]?.trim().split(/\s+/);
  return columns?.[0] !== undefined && columns[1] !== undefined
    ? `${columns[0]} (PID ${columns[1]})`
    : "another process (PID unavailable)";
}

/**
 * Recognizes the existing occupied-address native failure.
 * @param error - Original native bind failure.
 * @returns Whether the failure indicates an occupied address.
 */
function isAddressInUse(error: unknown): boolean {
  return (
    error instanceof Error &&
    (("code" in error && error.code === "EADDRINUSE") ||
      /address already in use/i.test(error.message))
  );
}
