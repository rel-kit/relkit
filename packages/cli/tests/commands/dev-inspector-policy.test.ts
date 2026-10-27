/** Verifies accepted inspector policy changes report an explicit restart instead of a silent reload. */
import { expect, test } from "bun:test";
import { Effect, Exit, Layer } from "effect";
import { DEFAULT_TOOLING_CONFIG } from "@relkit/compiler";
import type { InspectorConfiguration } from "@relkit/contracts";
import type { CandidateCompileRequest } from "@relkit/supervisor";
import { inspectorRestartNotice } from "../../src/commands/dev-inspector-policy.js";
import { formatDevLog } from "../../src/commands/dev-log-format.js";
import { makeDevLocalCompilerEffect } from "../../src/commands/dev-local-compiler.js";
import { cleanupLayer } from "../../src/services/cleanup.service.js";
import { CliModules } from "../../src/services/modules.service.js";
import { CliProject } from "../../src/services/project.service.js";
import type { CheckResult } from "../../src/commands/check-result.types.js";
import { compilerTestLayer, filesystemTestLayer } from "../services/test-layers.js";

const connection = { host: "127.0.0.1", port: 0 };
const enabled: InspectorConfiguration = { ...DEFAULT_TOOLING_CONFIG.inspector, enabled: true };

test("enabling inspection after startup requires a restart", () => {
  expect(inspectorRestartNotice(false, enabled)).toContain("Restart relkit dev");
  expect(inspectorRestartNotice(false, DEFAULT_TOOLING_CONFIG.inspector)).toBeUndefined();
});

test("disabling inspection or moving the bridge after startup requires a restart", () => {
  expect(inspectorRestartNotice(connection, DEFAULT_TOOLING_CONFIG.inspector)).toContain(
    "inspector.enabled is now false",
  );
  expect(inspectorRestartNotice(connection, enabled)).toBeUndefined();
  expect(
    inspectorRestartNotice(connection, { ...enabled, connection: { ...connection, port: 4100 } }),
  ).toContain("inspector.connection changed");
});

test("restart notices render as a warning rather than a successful reload", () => {
  const line = formatDevLog({
    version: 2,
    signal: "log",
    timestamp: "2026-10-27T12:00:00.000Z",
    level: "warn",
    component: "cli.dev",
    message: "dev.inspector.restart-required",
    fields: { message: "Restart relkit dev to connect the Inspector." },
  });
  expect(line).toContain("Inspector configuration changed; restart dev to apply it");
  expect(line).toContain("Restart relkit dev to connect the Inspector.");
});

test("each accepted generation reports its inspector policy before building", async () => {
  const observed: InspectorConfiguration[] = [];
  const checked: CheckResult = {
    ok: true,
    activatable: true,
    projectRoot: "/project",
    generatedDirectory: "/project/.relkit/generated",
    diagnostics: [],
    config: { ...DEFAULT_TOOLING_CONFIG, inspector: enabled },
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
  const request: CandidateCompileRequest = {
    token: { sourceToken: 1, generationToken: 1 },
    projectRoot: "/project",
    outputDirectory: "/project/.relkit/generated/test",
    signal: new AbortController().signal,
  };
  // The build is forbidden so the test observes only policy reporting before bundling.
  const forbidden = () => Effect.die(new Error("Unexpected build"));
  const exit = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const compiler = yield* makeDevLocalCompilerEffect({
          projectRoot: "/project",
          initialCheck: Effect.succeed(checked),
          configureInspector: (next) => Effect.sync(() => void observed.push(next)),
        });
        return yield* Effect.exit(compiler.compileEffect(request));
      }),
    ).pipe(
      Effect.provide(
        Layer.mergeAll(
          cleanupLayer,
          compilerTestLayer(),
          filesystemTestLayer(),
          Layer.succeed(CliModules, { load: forbidden, invalidate: () => Effect.void }),
          Layer.succeed(CliProject, {
            check: forbidden,
            build: forbidden,
            checkDevelopment: forbidden,
          }),
        ),
      ),
    ),
  );
  expect(Exit.isFailure(exit)).toBe(true);
  expect(observed).toEqual([enabled]);
});
