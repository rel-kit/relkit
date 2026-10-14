/** Dies after one actual publication write so recovery must rely on the persisted private receipt. */
import { Effect, Layer } from "effect";
import { LayoutFiles, layoutFilesLayer } from "../../src/migration/layout-files.service.js";
import { LayoutMigration } from "../../src/migration/layout-migration.service.js";
import { fileSystemLayer } from "../../src/services/filesystem.service.js";
import { processLayer } from "../../src/services/process.service.js";
import { projectCapabilitiesLayer } from "../../src/services/project-capabilities.js";

const root = process.argv[2];
if (!root) throw new Error("Crash child requires the parent-owned fixture root");
const crashFiles = Layer.effect(
  LayoutFiles,
  Effect.gen(function* () {
    const native = yield* LayoutFiles;
    let mutations = 0;
    return {
      ...native,
      put: (project, file) =>
        native.put(project, file).pipe(
          Effect.andThen(
            Effect.sync(() => {
              if (project === root && ++mutations === 1) process.kill(process.pid, "SIGKILL");
            }),
          ),
        ),
    };
  }),
).pipe(Layer.provide(layoutFilesLayer));
const crashingMigration = Layer.effect(LayoutMigration, LayoutMigration.make).pipe(
  Layer.provide(
    Layer.mergeAll(crashFiles, fileSystemLayer, processLayer, projectCapabilitiesLayer),
  ),
);

await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      yield* (yield* LayoutMigration).write(root);
    }),
  ).pipe(Effect.provide(crashingMigration)),
);
throw new Error("Expected native publication crash was not reached");
