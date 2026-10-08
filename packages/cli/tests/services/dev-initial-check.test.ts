import { expect, it } from "@effect/vitest";
import { loadConfig } from "@relkit/compiler";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Logger } from "effect";
import { cliAdapterError } from "../../src/cli-errors.js";
import { devCommandOperationEffect } from "../../src/commands/dev-command-operation.js";
import { resolveInspectorInstallation } from "../../src/commands/dev-inspector.js";
import { CliTelemetryNative } from "../../src/commands/dev-telemetry-native.service.js";
import { CliPortProbe } from "../../src/commands/port-availability.service.js";
import { CliDevSupervisor } from "../../src/services/dev-supervisor.service.js";
import { CliSourceWatch } from "../../src/services/source-watch.service.js";
import { cleanupLayer } from "../../src/services/cleanup.service.js";
import { CliModules } from "../../src/services/modules.service.js";
import { CliProject } from "../../src/services/project.service.js";
import { compilerTestLayer, filesystemTestLayer } from "./test-layers.js";
import type { DevCheckRequest } from "../../src/commands/dev-check.types.js";
import type { ProjectCapabilities } from "../../src/services/project.types.js";
import type { CheckResult } from "../../src/commands/check-result.types.js";
import type { CliCommandContext } from "../../src/main-support-types.js";

const root = "/relkit-initial-check";
const args = ["--project-root", root, "--port", "12345", "--inspector-port", "12346"];
const context: CliCommandContext = {
  command: "dev",
  args,
  json: false,
  signal: new AbortController().signal,
  reporter: { output: () => undefined, error: () => undefined },
  log: () => undefined,
};

/**
 * Supplies only the initial check; every later filesystem/compiler operation is forbidden.
 * @param checkDevelopment - Deterministic substitute for the scoped native check capability.
 * @returns A complete command graph whose native session acquisition remains lazy.
 */
function layer(checkDevelopment: ProjectCapabilities["checkDevelopment"]) {
  const unexpected = () => Effect.die(new Error("Unexpected ordinary project operation."));
  const forbidden = () =>
    Effect.die(new Error("Session or telemetry admitted before initial check."));
  return Layer.mergeAll(
    cleanupLayer,
    Layer.succeed(
      CliDevSupervisor,
      CliDevSupervisor.of({
        start: forbidden,
        verify: forbidden,
        dispose: forbidden,
        drain: forbidden,
        listen: forbidden,
        stopProxy: forbidden,
      }),
    ),
    Layer.succeed(CliSourceWatch, CliSourceWatch.of({ watch: forbidden, poll: forbidden })),
    Layer.succeed(CliPortProbe, CliPortProbe.of({ check: forbidden })),
    Layer.succeed(
      CliTelemetryNative,
      CliTelemetryNative.of({
        worker: forbidden,
        stream: forbidden,
        listen: forbidden,
        closeWorker: forbidden,
      }),
    ),
    Layer.succeed(
      CliProject,
      CliProject.of({
        check: unexpected,
        checkDevelopment,
        build: unexpected,
      }),
    ),
    compilerTestLayer({ loadConfig: () => Effect.succeed(loadConfig({}, root)) }),
    filesystemTestLayer(),
    Layer.succeed(
      CliModules,
      CliModules.of({
        load: () => Effect.succeed({ default: {} }),
        invalidate: () => Effect.void,
      }),
    ),
  );
}

/** Failed diagnostics need no generated artifact paths because admission ends before reading them. */
const failed: CheckResult = {
  ok: false,
  activatable: false,
  projectRoot: root,
  generatedDirectory: `${root}/.relkit/generated`,
  diagnostics: [{ code: "TEST_INITIAL", severity: "error", message: "Initial check failed." }],
  outputs: {
    graph: "",
    manifest: "",
    runtimeActivation: "",
    runtimeIntegrations: "",
    runtimeIntegrationImports: "",
    localServices: "",
    diagnostics: "",
    openapi: "",
    client: "",
    contract: "",
    clientContract: "",
    clientRegistry: "",
    clientManifest: "",
  },
};

it.effect(
  "default inspector discovery resolves the module directory under the Node test runtime",
  () =>
    Effect.sync(() => {
      const expected = fileURLToPath(new URL("../../../../apps/inspector", import.meta.url));
      expect(resolveInspectorInstallation(undefined, {}).root).toBe(resolve(expected));
    }),
);

it.effect(
  "initial development uses the substitute with fresh identity and preserves diagnostics",
  () =>
    Effect.gen(function* () {
      const requests: DevCheckRequest[] = [];
      const graph = layer((request) =>
        Effect.sync(() => {
          requests.push(request);
          return failed;
        }),
      );
      for (let attempt = 0; attempt < 2; attempt++) {
        const failure = yield* Effect.flip(
          Effect.scoped(devCommandOperationEffect(args, context)).pipe(
            Effect.provide(graph),
            Effect.provide(Logger.layer([])),
          ),
        );
        expect(failure._tag).toBe("CliFailureError");
        if (failure._tag === "CliFailureError") {
          expect(failure.code).toBe("RELKIT_DEV_COMPILE_FAILED");
          expect(failure.message).toContain("Initial check failed.");
        }
      }
      expect(requests).toHaveLength(2);
      expect(requests[0]?.projectRoot).toBe(root);
      expect(requests[0]?.generationId).toMatch(/^dev-initial-/);
      expect(requests[1]?.generationId).not.toBe(requests[0]?.generationId);
    }),
);

it.effect(
  "initial worker transport failure retains its typed identity before session admission",
  () =>
    Effect.gen(function* () {
      const failure = cliAdapterError("dev.compiler.spawn", new Error("Cannot spawn compiler."));
      const outcome = yield* Effect.flip(
        Effect.scoped(devCommandOperationEffect(args, context)).pipe(
          Effect.provide(layer(() => Effect.fail(failure))),
          Effect.provide(Logger.layer([])),
        ),
      );
      expect(outcome).toBe(failure);
    }),
);

it.effect("interrupting the initial capability joins its release before admitting telemetry", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const releasing = yield* Deferred.make<void>();
    const released = yield* Deferred.make<void>();
    const graph = layer(() =>
      Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(
          Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Deferred.await(released))),
        ),
      ),
    );
    const running = yield* Effect.scoped(devCommandOperationEffect(args, context)).pipe(
      Effect.provide(graph),
      Effect.provide(Logger.layer([])),
      Effect.forkChild,
    );
    yield* Deferred.await(entered);
    const interrupting = yield* Fiber.interrupt(running).pipe(Effect.forkChild);
    yield* Deferred.await(releasing);
    expect(interrupting.pollUnsafe()).toBeUndefined();
    yield* Deferred.succeed(released, undefined);
    yield* Fiber.join(interrupting);
    const outcome = yield* Fiber.await(running);
    expect(Exit.isFailure(outcome)).toBe(true);
    if (Exit.isFailure(outcome)) expect(Cause.hasInterruptsOnly(outcome.cause)).toBe(true);
  }),
);
