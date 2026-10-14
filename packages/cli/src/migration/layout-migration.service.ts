/** Owns preview, staged publication and guarded receipt rollback under one invocation scope. */
import { resolve } from "node:path";
import { Context, Effect, Layer } from "effect";
import { observeCli } from "../cli-runtime.js";
import { planLayoutMigration } from "./layout-plan.js";
import { assertLayoutWritePolicy } from "./layout-guards.js";
import { writeLayoutMigration, rollbackLayoutMigration } from "./layout-operations.js";
import { validateLayoutCandidate } from "./layout-validation.js";
import { layoutFilesLayer } from "./layout-files.service.js";
import { fileSystemLayer } from "../services/filesystem.service.js";
import { processLayer } from "../services/process.service.js";
import { projectCapabilitiesLayer } from "../services/project-capabilities.js";

/** Migration methods capture only invocation-level native capabilities, never request identity. */
export class LayoutMigration extends Context.Service<LayoutMigration>()(
  "relkit/cli/LayoutMigration",
  {
    make: Effect.gen(function* () {
      const dependencies = yield* Effect.context<
        | Effect.Services<ReturnType<typeof planLayoutMigration>>
        | Effect.Services<ReturnType<typeof validateLayoutCandidate>>
        | Effect.Services<ReturnType<typeof assertLayoutWritePolicy>>
      >();
      const preview = Effect.fn("Migration.preview")(
        (root: string) => planLayoutMigration(resolve(root)).pipe(Effect.provide(dependencies)),
        (effect) => observeCli("migration.preview", effect),
      );
      const write = (root: string) => writeLayoutMigration(root).pipe(Effect.provide(dependencies));
      const rollback = (root: string, path: string) =>
        rollbackLayoutMigration(root, path).pipe(Effect.provide(dependencies));
      return { preview, write, rollback };
    }),
  },
) {}

/** Live migration construction acquires adapters, never projects or resource clients. */
export const layoutMigrationLayer = Layer.effect(LayoutMigration, LayoutMigration.make).pipe(
  Layer.provide(
    Layer.mergeAll(layoutFilesLayer, fileSystemLayer, processLayer, projectCapabilitiesLayer),
  ),
);
