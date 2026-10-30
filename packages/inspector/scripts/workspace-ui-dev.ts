#!/usr/bin/env bun
/**
 * Runs the standalone inspector tool against a real project while serving the
 * workspace UI from `apps/inspector` with `next dev` instead of the packaged
 * build, so UI changes hot-reload against live application data.
 *
 * Usage: bun packages/inspector/scripts/workspace-ui-dev.ts --project-root <dir> [--port 3211]
 */
import { resolve } from "node:path";
import { Cause, Effect, Layer } from "effect";
import {
  connectionAttempt,
  InspectionConnectionError,
  InspectionFilesLive,
  InspectionNativeLive,
} from "@relkit/inspector-api/connection";
import { INSPECTOR_HELP, parseInspectorOptions } from "../src/options.js";
import type { InspectorOptions } from "../src/options.types.js";
import { InspectorDiscoveryLive } from "../src/discovery.service.js";
import { InspectorRemoteLive } from "../src/remote.service.js";
import { InspectorHistoryNativeLive } from "../src/history-native.service.js";
import { InspectorUiNative } from "../src/ui-native.service.js";
import { probeInspectorUi, waitInspectorUiReady } from "../src/ui-readiness.js";
import { InspectorTool } from "../src/tool.service.js";

const root = resolve(import.meta.dir, "../../..");
const ui = resolve(root, "apps/inspector");
const nextBin = resolve(ui, "node_modules/next/dist/bin/next");

/** Spawns `next dev` for the workspace UI with the tool's private backend credentials. */
const startDevUi = Effect.fn("InspectorDev.startUi")(function* (
  options: InspectorOptions,
  backend: string,
  token: string,
) {
  const child = yield* Effect.acquireRelease(
    connectionAttempt("ui.spawn", () =>
      Promise.resolve(
        Bun.spawn(
          [
            "node",
            nextBin,
            "dev",
            "--webpack",
            "--hostname",
            options.hostname,
            "--port",
            String(options.port),
          ],
          {
            cwd: ui,
            stdout: "inherit",
            stderr: "inherit",
            env: {
              ...process.env,
              RELKIT_BACKEND_URL: backend,
              RELKIT_INSPECTOR_API_TOKEN: token,
              RELKIT_INSPECTOR_DIST_DIR: ".next-dev",
            },
          },
        ),
      ),
    ),
    (child) =>
      Effect.sync(() => {
        if (child.exitCode === null) child.kill("SIGTERM");
      }),
  );
  const exited = connectionAttempt("ui.exit", () => child.exited).pipe(
    Effect.flatMap((code) =>
      Effect.fail(
        new InspectionConnectionError({
          operation: "ui.exited",
          cause: new Error(`Inspector dev UI exited (${code})`),
        }),
      ),
    ),
  );
  const endpoint = `http://${options.hostname}:${options.port}/`;
  yield* Effect.raceFirst(waitInspectorUiReady(probeInspectorUi(fetch, endpoint)), exited);
  yield* Effect.logInfo(`RELKIT Inspector (dev UI) listening at ${endpoint}`);
  return exited;
});

/** Replaces the packaged UI child with the workspace `next dev` server. */
const InspectorUiDevLive = Layer.succeed(InspectorUiNative, { start: startDevUi });

const InspectorToolDevLive = Layer.effect(InspectorTool, InspectorTool.make).pipe(
  Layer.provide(
    Layer.mergeAll(
      InspectionFilesLive,
      InspectionNativeLive,
      InspectorDiscoveryLive,
      InspectorRemoteLive,
      InspectorUiDevLive,
      InspectorHistoryNativeLive,
    ),
  ),
);

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    INSPECTOR_HELP.replace(
      "relkit-inspector",
      "bun packages/inspector/scripts/workspace-ui-dev.ts",
    ),
  );
} else {
  const args = process.argv.slice(2);
  if (!args.includes("--port")) args.push("--port", "3211");
  const program = Effect.gen(function* () {
    const options = yield* Effect.try({
      try: () => parseInspectorOptions(args),
      catch: (cause) =>
        new InspectionConnectionError({
          operation: "launch.invalid",
          cause: cause instanceof Error ? cause : new Error("Invalid launch options"),
        }),
    });
    yield* InspectorTool.use((tool) => tool.run(options));
  }).pipe(
    Effect.provide(InspectorToolDevLive),
    Effect.tapCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.void
        : Effect.logError("Inspector dev harness stopped", { cause: Cause.pretty(cause) }),
    ),
    Effect.scoped,
  );
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  Effect.runPromise(program, { signal: controller.signal }).then(
    () => process.exit(0),
    () => process.exit(1),
  );
}
