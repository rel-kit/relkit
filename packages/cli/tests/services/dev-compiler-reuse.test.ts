/** Exercises compiler validation selection with injected projects; diagnostics stop before native builds. */
import { expect, it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { makeDevLocalCompilerEffect } from "../../src/commands/dev-local-compiler.js";
import { CliProject } from "../../src/services/project.service.js";
import { CliModules } from "../../src/services/modules.service.js";
import { cleanupLayer } from "../../src/services/cleanup.service.js";
import { compilerTestLayer, filesystemTestLayer } from "./test-layers.js";
import type { CheckResult } from "../../src/commands/check-result.types.js";
import type { CandidateCompileRequest } from "@relkit/supervisor";

/** A diagnostic stops before bundling so tests exercise validation selection in isolation. */
const diagnostic: CheckResult = {
  ok: false,
  activatable: false,
  projectRoot: "/project",
  generatedDirectory: "/project/.relkit/generated",
  diagnostics: [{ code: "TEST_CHECK", severity: "error", message: "Validation selected" }],
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

/** Substitutes the owned compiler check; native compilation and bundling are forbidden. */
function fixture() {
  let checks = 0;
  const forbidden = () => Effect.die(new Error("Unexpected build"));
  return {
    checks: () => checks,
    layer: Layer.mergeAll(
      cleanupLayer,
      compilerTestLayer(),
      filesystemTestLayer(),
      Layer.succeed(CliModules, { load: forbidden, invalidate: () => Effect.void }),
      Layer.succeed(CliProject, {
        check: forbidden,
        build: forbidden,
        checkDevelopment: () =>
          Effect.sync(() => {
            checks += 1;
            return diagnostic;
          }),
      }),
    ),
  };
}

it.effect("consumes initial validation once and checks subsequent generations freshly", () =>
  Effect.gen(function* () {
    const test = fixture();
    yield* Effect.scoped(
      Effect.gen(function* () {
        const compiler = yield* makeDevLocalCompilerEffect({
          projectRoot: "/project",
          initialCheck: Effect.succeed(diagnostic),
        });
        expect(Exit.isFailure(yield* Effect.exit(compiler.compileEffect(request)))).toBe(true);
        expect(test.checks()).toBe(0);
        expect(Exit.isFailure(yield* Effect.exit(compiler.compileEffect(request)))).toBe(true);
        expect(test.checks()).toBe(1);
      }).pipe(Effect.provide(test.layer)),
    );
  }),
);

it.effect("invalidation discards the initial check before compilation", () =>
  Effect.gen(function* () {
    const test = fixture();
    let discarded = 0;
    yield* Effect.scoped(
      Effect.gen(function* () {
        const compiler = yield* makeDevLocalCompilerEffect({
          projectRoot: "/project",
          initialCheck: Effect.succeed(diagnostic),
          discardInitialCheck: Effect.sync(() => {
            discarded += 1;
          }),
        });
        yield* compiler.invalidateEffect;
        expect(discarded).toBe(1);
        expect(Exit.isFailure(yield* Effect.exit(compiler.compileEffect(request)))).toBe(true);
        expect(test.checks()).toBe(1);
      }).pipe(Effect.provide(test.layer)),
    );
  }),
);
