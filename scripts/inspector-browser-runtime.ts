/** Owns this browser gate's dynamic listeners, unique evidence directory and
 * native processes. Browser closure precedes joined child-group shutdown; only
 * this run's evidence and standalone history remain available.
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { Clock, Effect } from "effect";
import { scaffoldPort } from "./scaffold-http.js";
import { ScaffoldProcess, scaffoldChild } from "./scaffold-process.js";
import type { ScaffoldChild } from "./scaffold-process.types.js";
import { browserEnvironment, inspectorBrowserDriver } from "./inspector-browser-driver.js";
import type { BrowserAcceptanceDriver } from "./test-inspector-agent-browser.js";
import { browserCallback } from "./inspector-browser-callback.js";

const root = resolve(import.meta.dir, "..");

/** Runs native UI work inside one interruptible resource scope.
 * @param scenario - Existing UI actions and failure evidence capture.
 * @returns Completion after browser and both server groups have joined cleanup.
 */
export async function withInspectorBrowser(
  scenario: (driver: BrowserAcceptanceDriver, artifacts: string) => Promise<void>,
): Promise<void> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await Effect.runPromise(browserRun(scenario).pipe(Effect.scoped), {
      signal: controller.signal,
    });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

const browserRun = Effect.fn("InspectorBrowser.run")(function* (
  scenario: (driver: BrowserAcceptanceDriver, artifacts: string) => Promise<void>,
) {
  const selected = yield* browserSelection;
  const commands = yield* ScaffoldProcess.make;
  const fixture = yield* scaffoldChild({
    cwd: root,
    args: ["tests/inspector/fixture-server.ts"],
    env: {
      RELKIT_FIXTURE_PORT: String(selected.backend),
      RELKIT_FIXTURE_PROJECT: selected.project,
      RELKIT_FIXTURE_TIME: new Date(yield* Clock.currentTimeMillis).toISOString(),
    },
  });
  yield* Effect.addFinalizer(() => retainInspectorOutput(fixture, selected.artifacts, "fixture"));
  const inspector = yield* startInspector(selected);
  yield* Effect.addFinalizer(() => retainInspectorOutput(inspector, selected.artifacts));
  yield* Effect.addFinalizer(() =>
    commands
      .run({
        executable: "agent-browser",
        args: ["--session", selected.session, "close"],
        cwd: root,
        env: browserEnvironment,
      })
      .pipe(Effect.timeout("60 seconds"), Effect.asVoid, Effect.orDie),
  );
  yield* browserCallback(async (signal) => {
    const driver = inspectorBrowserDriver(
      selected.baseUrl,
      selected.session,
      root,
      signal,
      commands,
    );
    await waitFor(`${selected.baseUrl}/buckets/assets`, inspector.process, signal);
    await scenario(driver, selected.artifacts);
  });
});

/** Joins the run-owned server before retaining complete output and original exit status.
 * @param inspector - Existing idempotent child owner.
 * @param artifacts - This run's retained evidence directory.
 * @returns Infallible cleanup unless native release or evidence writing defects.
 */
function retainInspectorOutput(inspector: ScaffoldChild, artifacts: string, name = "inspector") {
  return native(async () => {
    const beforeRelease = inspector.process.exitCode;
    try {
      await inspector.release();
    } finally {
      await writeFile(join(artifacts, `${name}.log`), inspector.output());
      await writeFile(
        join(artifacts, `${name}-exit.json`),
        JSON.stringify({
          pid: inspector.process.pid,
          beforeRelease,
          afterRelease: inspector.process.exitCode,
        }),
      );
    }
  }).pipe(Effect.orDie);
}

/** Starts the actual standalone tool, including its private BFF and history owner.
 * @param selected - This run's concrete listener and project selection.
 * @returns The existing scoped child owner, with output drains already active.
 */
function startInspector(selected: Effect.Success<typeof browserSelection>) {
  return scaffoldChild({
    cwd: root,
    args: [
      join(root, "packages/inspector/dist/bin.js"),
      "--project-root",
      selected.project,
      "--hostname",
      "127.0.0.1",
      "--port",
      String(selected.port),
    ],
    env: {
      NODE_OPTIONS: "--max-old-space-size=2048",
      RAYON_NUM_THREADS: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
}

const browserSelection = Effect.gen(function* () {
  const requested = process.env.RELKIT_INSPECTOR_BROWSER_PORT;
  const port = requested === undefined ? yield* scaffoldPort : Number(requested);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    return yield* Effect.fail(
      new RangeError("RELKIT_INSPECTOR_BROWSER_PORT must be a TCP port from 1 through 65535."),
    );
  let backend = yield* scaffoldPort;
  for (let attempt = 0; backend === port && attempt < 10; attempt++) backend = yield* scaffoldPort;
  if (backend === port)
    return yield* Effect.fail(new Error("Cannot allocate distinct browser listeners"));
  yield* native(() => mkdir(join(root, ".relkit"), { recursive: true }));
  const artifacts = yield* native(() => mkdtemp(join(root, ".relkit/inspector-browser-")));
  const session = basename(artifacts);
  return {
    port,
    backend,
    artifacts,
    session,
    project: join(artifacts, "project"),
    baseUrl: `http://127.0.0.1:${port}`,
  };
});

/** Translates a finite filesystem boundary while retaining the original Error.
 * @typeParam A - The actual native operation result.
 * @param run - Lazy native filesystem call.
 * @returns Its value or the original Error with non-Error rejection as cause.
 */
function native<A>(run: () => Promise<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (cause) =>
      cause instanceof Error ? cause : new Error("Inspector browser resource failed", { cause }),
  });
}

/** Keeps the original hundred readiness attempts and hundred-millisecond pacing.
 * @param url - Exact selected UI URL.
 * @param child - Owned Next process whose early exit rejects readiness.
 * @param signal - Caller interruption, also forwarded to each bounded request.
 * @returns Completion after a successful response body is released.
 */
async function waitFor(
  url: string,
  child: Bun.ReadableSubprocess,
  signal: AbortSignal,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    signal.throwIfAborted();
    if (child.exitCode !== null)
      throw new Error(`Inspector exited before readiness (${child.exitCode})`);
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]),
    }).catch(() => undefined);
    const ready = response?.ok;
    await response?.body?.cancel();
    if (ready) return;
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
