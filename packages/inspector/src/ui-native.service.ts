/** Owns the packaged Node UI child without inheriting application environment values. */
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { access } from "node:fs/promises";
import { Context, Effect, Layer } from "effect";
import { connectionAttempt, InspectionConnectionError } from "@relkit/inspector-api/connection";
import type { InspectorOptions } from "./options.types.js";
import { probeInspectorUi, waitInspectorUiReady } from "./ui-readiness.js";

/** Native UI acquisition is separate from all application/session ownership. */
export class InspectorUiNative extends Context.Service<InspectorUiNative>()(
  "relkit/inspector/UiNative",
  {
    make: Effect.sync(() => ({
      start: (options: InspectorOptions, backend: string, token: string) =>
        acquireInspectorUi(
          fileURLToPath(new URL("./ui/server.js", import.meta.url)),
          options,
          backend,
          token,
        ),
    })),
  },
) {}

/** Live child adapter, acquired only by an explicit standalone launch. */
export const InspectorUiNativeLive = Layer.effect(InspectorUiNative, InspectorUiNative.make);

/** Runs the exact packaged UI and joins its process on tool exit. */
export const acquireInspectorUi = Effect.fn("Inspector.startUi")(function* (
  entry: string,
  options: InspectorOptions,
  backend: string,
  token: string,
) {
  yield* connectionAttempt("ui.assets", () => access(entry));
  const child = yield* Effect.acquireRelease(
    connectionAttempt("ui.spawn", () =>
      Promise.resolve(
        Bun.spawn(["node", entry], {
          cwd: dirname(entry),
          stdout: "inherit",
          stderr: "inherit",
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            TMPDIR: process.env.TMPDIR,
            NODE_ENV: "production",
            HOSTNAME: options.hostname,
            PORT: String(options.port),
            RELKIT_BACKEND_URL: backend,
            RELKIT_INSPECTOR_API_TOKEN: token,
          },
        }),
      ),
    ),
    (child) => stopUi(child),
  );
  yield* Effect.raceFirst(waitUiReady(options), uiExit(child));
  yield* Effect.logInfo(`RELKIT Inspector listening at http://${options.hostname}:${options.port}`);
  return uiExit(child);
});

/** Retains the UI's actual terminal outcome independently from readiness polling. */
function uiExit(child: Bun.Subprocess) {
  return connectionAttempt("ui.exit", () => child.exited).pipe(
    Effect.flatMap((code) =>
      Effect.fail(
        new InspectionConnectionError({
          operation: "ui.exited",
          cause: new Error(`Inspector UI exited (${code})`),
        }),
      ),
    ),
  );
}

/** Advertises listening only after the actual packaged UI serves a response. */
const waitUiReady = Effect.fn("Inspector.uiReady")(function* (options: InspectorOptions) {
  const host =
    options.hostname === "0.0.0.0" || options.hostname === "::" ? "127.0.0.1" : options.hostname;
  const endpoint = `http://${host.includes(":") ? `[${host}]` : host}:${options.port}/`;
  yield* waitInspectorUiReady(probeInspectorUi(fetch, endpoint));
});

/** Gives the owned UI four seconds to exit before joining a forced termination. */
const stopUi = Effect.fn("Inspector.stopUi")(function* (child: Bun.Subprocess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  yield* connectionAttempt("ui.stop", () => child.exited).pipe(
    Effect.timeout(4000),
    Effect.catchTag("TimeoutError", () =>
      Effect.sync(() => child.kill("SIGKILL")).pipe(
        Effect.andThen(connectionAttempt("ui.reap", () => child.exited)),
      ),
    ),
    Effect.catchTag("InspectionConnectionError", () =>
      Effect.logWarning("Inspector UI cleanup failed"),
    ),
  );
});
