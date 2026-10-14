/** Compares the native session compiler's current artifacts with a new clean compiler after real watched source/layout/config mutations. */
import { expect, test } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { migrationFixture } from "../../packages/cli/tests/migration/fixture.js";
import { makeDevLocalCompilerEffect } from "../../packages/cli/src/commands/dev-local-compiler.js";
import { buildCapabilitiesLayer } from "../../packages/cli/src/services/project-capabilities.js";
import { projectLiveLayer } from "../../packages/cli/src/services/project.service.js";
import { sourceWatchLayer } from "../../packages/cli/src/services/source-watch.service.js";
import { scaffoldNative } from "../../scripts/scaffold-native.js";
import { layoutDevelopmentMutations } from "./fixtures/layout-development-mutations.js";
import { layoutDevelopmentWatch } from "./fixtures/layout-development-watch.js";
import { verifyRejectedDevelopment } from "./fixtures/layout-development-rejection.js";

const capabilities = Layer.mergeAll(buildCapabilitiesLayer, projectLiveLayer, sourceWatchLayer);

test(
  "native watched source states produce the same incremental and clean artifacts",
  () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const root = yield* migrationFixture;
        yield* scaffoldNative("layout.development.destinations", () =>
          mkdir(join(root, ".relkit/matrix"), { recursive: true }),
        );
        const compiler = yield* makeDevLocalCompilerEffect({
          projectRoot: root,
          localEnabled: false,
        });
        const watcher = yield* layoutDevelopmentWatch(root);
        let epoch = 1;
        yield* compareCurrentBuild(root, compiler, epoch);
        for (const mutation of layoutDevelopmentMutations) {
          yield* watcher.clear;
          yield* scaffoldNative("layout.development." + mutation.name, () => mutation.apply(root));
          expect(yield* watcher.changed).not.toBe("");
          yield* compiler.invalidateEffect;
          yield* compareCurrentBuild(root, compiler, ++epoch);
        }
        yield* verifyRejectedDevelopment(root, compiler, epoch);
        yield* compareCurrentBuild(root, compiler, epoch + 2);
        expect(
          yield* scaffoldNative("layout.development.state", () =>
            readFile(join(root, ".relkit/state/sentinel"), "utf8"),
          ),
        ).toBe("state-byte-sentinel");
        expect(
          yield* scaffoldNative("layout.development.observability", () =>
            readFile(join(root, ".relkit/observability/sentinel"), "utf8"),
          ),
        ).toBe("observability-byte-sentinel");
        yield* compiler.closeEffect;
      }).pipe(Effect.scoped, Effect.provide(capabilities), Effect.timeout("4 minutes")),
    ),
  300_000,
);

/** Compares complete original graph/API/server-source artifacts and real copied assets at one final authored state.
 * @param root - Native source root whose state is identical for both compilers.
 * @param compiler - Original session compiler retaining its native lifecycle and cache state.
 * @param epoch - Actual source mutation sequence used for distinct owned build destinations.
 * @returns Completion after both native compilers join and their complete compared bytes agree.
 */
const compareCurrentBuild = Effect.fn("LayoutDevelopment.compare")(function* (
  root: string,
  compiler: Effect.Success<ReturnType<typeof makeDevLocalCompilerEffect>>,
  epoch: number,
) {
  const incremental = join(root, ".relkit/matrix/incremental-" + epoch);
  const clean = join(root, ".relkit/matrix/clean-" + epoch);
  const request = (outputDirectory: string) => ({
    projectRoot: root,
    outputDirectory,
    token: { sourceToken: epoch, generationToken: epoch },
    signal: new AbortController().signal,
  });
  yield* compiler.compileEffect(request(incremental));
  yield* Effect.scoped(
    Effect.gen(function* () {
      const fresh = yield* makeDevLocalCompilerEffect({ projectRoot: root, localEnabled: false });
      yield* fresh.compileEffect(request(clean));
    }),
  );
  for (const member of ["application.graph.json", "openapi.json", "server/index.ts"]) {
    const before = yield* scaffoldNative("layout.development.incremental", () =>
      readFile(join(incremental, member), "utf8"),
    );
    const after = yield* scaffoldNative("layout.development.clean", () =>
      readFile(join(clean, member), "utf8"),
    );
    expect(before).toBe(after);
  }
  if (epoch >= 7) {
    for (const directory of [incremental, clean])
      expect(
        yield* scaffoldNative("layout.development.asset", () =>
          readFile(join(directory, "public/message.txt"), "utf8"),
        ),
      ).toBe("native public latest");
  }
});
