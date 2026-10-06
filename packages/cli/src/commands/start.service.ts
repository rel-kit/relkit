import { join, resolve } from "node:path";
import { Context, Effect, Layer } from "effect";
import { DEFAULT_CANDIDATE_HEALTH_TIMEOUT_MS } from "@relkit/supervisor";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { fileSystemLayer } from "../services/filesystem.service.js";
import { cleanupLayer } from "../services/cleanup.service.js";
import { resolveApplicationPort } from "./ports.js";
import { CliBuiltProject, builtProjectLive } from "./start-built.js";
import { CliStartNative, startNativeLive } from "./start-native.service.js";
import { CliStartProcess, startProcessLive } from "./start-process.service.js";
import { waitForStartHealthEffect } from "./start-health.js";
import type { StartOperations, StartOptions } from "./start.types.js";

/** Production process domain whose returned resources belong to the caller's Scope. */
export class CliStart extends Context.Service<CliStart, StartOperations>()("relkit/cli/Start") {}

/**
 * Captures built-artifact, native bind/fetch, and process capabilities.
 * @returns A start Layer retaining explicit infrastructure requirements.
 */
export const startLive = makeStartLive({});

/**
 * Captures per-invocation settings without acquiring a process or listener.
 * @param defaults - Caller policy and production bind defaults.
 * @returns A start Layer with native requirements preserved.
 */
function makeStartLive(defaults: StartOptions) {
  return Layer.effect(
    CliStart,
    Effect.gen(function* () {
      const built = yield* CliBuiltProject;
      const native = yield* CliStartNative;
      const processes = yield* CliStartProcess;
      return CliStart.of({
        start: Effect.fn("Start.start")(
          function* (overrides) {
            const options = { ...defaults, ...overrides };
            const projectRoot = resolve(options.projectRoot ?? process.cwd());
            const buildDirectory = resolve(
              options.buildDirectory ?? join(projectRoot, ".relkit", "build"),
            );
            const artifacts = yield* built.read(buildDirectory);
            const hostname = options.hostname ?? "127.0.0.1";
            const healthTimeoutMs = options.healthTimeoutMs ?? DEFAULT_CANDIDATE_HEALTH_TIMEOUT_MS;
            const stopTimeoutMs = options.stopTimeoutMs ?? 1_000;
            yield* cliTry("start.settings", () => {
              if (!Number.isSafeInteger(healthTimeoutMs) || healthTimeoutMs < 1)
                throw new RangeError("healthTimeoutMs must be a positive safe integer.");
              if (!Number.isSafeInteger(stopTimeoutMs) || stopTimeoutMs < 0)
                throw new RangeError("stopTimeoutMs must be a non-negative safe integer.");
              if (options.signal?.aborted)
                throw options.signal.reason ?? new Error("Start was aborted.");
            });
            const source = {
              ...Object.fromEntries(
                Object.entries(process.env).filter(
                  (entry): entry is [string, string] => entry[1] !== undefined,
                ),
              ),
              ...Object.fromEntries(
                Object.entries(options.environment ?? {}).filter(
                  (entry): entry is [string, string] => entry[1] !== undefined,
                ),
              ),
            };
            const requested = yield* cliTry("start.port.settings", () =>
              resolveApplicationPort({
                ...(options.port === undefined ? {} : { flag: options.port }),
                source,
                ...(artifacts.manifest.server?.port === undefined
                  ? {}
                  : { configured: artifacts.manifest.server.port }),
              }),
            );
            const port = yield* native.allocate(requested, hostname);
            const owned = yield* processes.spawn({
              command: [
                process.execPath,
                "run",
                "--no-env-file",
                "--no-install",
                "--silent",
                join(buildDirectory, artifacts.manifest.containerEntrypoint),
              ],
              cwd: projectRoot,
              environment: {
                ...source,
                PORT: String(port),
                RELKIT_GRAPH_HASH: artifacts.graphHash,
              },
              stopTimeoutMs,
            });
            yield* waitForStartHealthEffect(hostname, port, healthTimeoutMs, owned.child).pipe(
              Effect.provideService(CliStartNative, native),
            );
            return Object.freeze({
              projectRoot,
              buildDirectory,
              hostname,
              port,
              process: owned.child,
              exited: owned.child.exited,
              stopEffect: owned.stop,
            });
          },
          (effect) => observeCli("start.start", effect),
        ),
      });
    }),
  );
}

/**
 * Provides the native production dependency graph without opening the process lifetime.
 * @param options - Native adapter replacements and invocation defaults.
 * @returns A start Layer; each start still requires the caller's explicit Scope.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * await Effect.runPromise(runStartEffect({ port: 0 }).pipe(Effect.provide(startLiveLayer())));
 * ```
 */
export function startLiveLayer(options: StartOptions = {}): Layer.Layer<CliStart> {
  const processes = startProcessLive(options.spawn).pipe(Layer.provide(cleanupLayer));
  return makeStartLive(options).pipe(
    Layer.provide(
      Layer.mergeAll(
        builtProjectLive.pipe(Layer.provide(fileSystemLayer)),
        startNativeLive(options.fetch).pipe(Layer.provide(cleanupLayer)),
        processes,
      ),
    ),
  );
}
