/**
 * Owns `relkit migrate` code-migration preview, write and rollback under one invocation scope.
 * Methods capture only native file, process and filesystem adapters; they never load or run
 * application code.
 */
import { Context, Effect, Layer } from "effect";
import { observeCli } from "../cli-runtime.js";
import { fileSystemLayer } from "../services/filesystem.service.js";
import { processLayer } from "../services/process.service.js";
import { layoutFilesLayer } from "./layout-files.service.js";
import {
  previewCodeMigration,
  rollbackCodeMigration,
  writeCodeMigration,
} from "./code-operations.js";
import type { CodeMigrationOptions } from "./code-migration.types.js";

/** Code migration methods bound to the invocation's native adapters. */
export class CodeMigration extends Context.Service<CodeMigration>()("relkit/cli/CodeMigration", {
  make: Effect.gen(function* () {
    const dependencies = yield* Effect.context<
      | Effect.Services<ReturnType<typeof writeCodeMigration>>
      | Effect.Services<ReturnType<typeof rollbackCodeMigration>>
    >();
    const preview = (root: string, options: CodeMigrationOptions) =>
      observeCli(
        "migration.code.preview",
        previewCodeMigration(root, options).pipe(Effect.provide(dependencies)),
      );
    const write = (root: string, options: CodeMigrationOptions) =>
      writeCodeMigration(root, options).pipe(Effect.provide(dependencies));
    const rollback = (root: string, path: string) =>
      rollbackCodeMigration(root, path).pipe(Effect.provide(dependencies));
    return { preview, write, rollback };
  }),
}) {}

/** Live code migration construction acquires adapters only. */
export const codeMigrationLayer = Layer.effect(CodeMigration, CodeMigration.make).pipe(
  Layer.provide(Layer.mergeAll(layoutFilesLayer, fileSystemLayer, processLayer)),
);
