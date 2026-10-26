/** Builds isolated initial-validation command Layers; all session resources are forbidden before the barrier completes. */
import { loadConfig } from "@relkit/compiler";
import { Effect, Layer } from "effect";
import { CliDevCapture } from "../../src/commands/dev-capture.service.js";
import { CliPortProbe } from "../../src/commands/port-availability.service.js";
import { CliDevSupervisor } from "../../src/services/dev-supervisor.service.js";
import { CliSourceWatch } from "../../src/services/source-watch.service.js";
import { cleanupLayer } from "../../src/services/cleanup.service.js";
import { CliModules } from "../../src/services/modules.service.js";
import { CliProject } from "../../src/services/project.service.js";
import { compilerTestLayer, filesystemTestLayer } from "./test-layers.js";
import type { ProjectCapabilities } from "../../src/services/project.types.js";
import type { CheckResult } from "../../src/commands/check-result.types.js";
import type { CliCommandContext } from "../../src/main-support-types.js";

const root = "/relkit-initial-check";
export const args = ["--project-root", root, "--port", "12345"];
export const context: CliCommandContext = {
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
 * @param close - Native watch release observed by lifecycle assertions.
 * @returns A complete command graph whose native session acquisition remains lazy.
 */
export function initialCheckTestLayer(
  checkDevelopment: ProjectCapabilities["checkDevelopment"],
  close = () => {},
) {
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
    Layer.succeed(
      CliSourceWatch,
      CliSourceWatch.of({
        watch: () => Effect.succeed(close),
        poll: forbidden,
      }),
    ),
    Layer.succeed(CliPortProbe, CliPortProbe.of({ check: forbidden })),
    telemetryForbiddenLayer,
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

/** Telemetry acquisition must stay behind the initial validation barrier. */
const telemetryForbiddenLayer = Layer.succeed(CliDevCapture, {
  acquire: () => Effect.die(new Error("Unexpected capture acquisition")),
});

/** Failed diagnostics need no generated artifact paths because admission ends before reading them. */
export const failed: CheckResult = {
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
