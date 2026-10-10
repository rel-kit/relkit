/**
 * Supplies the existing safe compiler and build workflows for finite preparation.
 * Shared filesystem/compiler/process authorities are captured during acquisition;
 * the accepted check is injected into build so preparation does not check twice.
 * This module is excluded from the eventual snapshot-hit dispatch dependency path.
 */
import { Context, Effect, Layer } from "effect";
import { CliCompiler } from "../services/compiler.service.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { CliModules } from "../services/modules.service.js";
import { CliProcess } from "../services/process.service.js";
import { CliCleanup } from "../services/cleanup.service.js";
import { buildProjectEffect } from "../commands/build.js";
import type { CheckResult } from "../commands/check-result.types.js";
import type { SnapshotCompilationOperations } from "./snapshot-compilation.types.js";
import { SnapshotFiles } from "./snapshot-files.service.js";
import { checkSnapshotProjectEffect } from "./snapshot-check-execution.js";
import { readSnapshotCheckReceipt } from "./snapshot-check-receipt.js";

/** Preparation-only compiler authority, replaceable through the same test Layer contract. */
export class SnapshotCompilation extends Context.Service<
  SnapshotCompilation,
  SnapshotCompilationOperations
>()("relkit/DevSnapshot/Compilation", {
  make: Effect.gen(function* () {
    const compiler = yield* CliCompiler;
    const files = yield* CliFileSystem;
    const modules = yield* CliModules;
    const processes = yield* CliProcess;
    const cleanup = yield* CliCleanup;
    const snapshotFiles = yield* SnapshotFiles;
    const authorities = Context.make(CliCompiler, compiler).pipe(
      Context.add(CliFileSystem, files),
      Context.add(CliModules, modules),
      Context.add(CliProcess, processes),
      Context.add(CliCleanup, cleanup),
      Context.add(SnapshotFiles, snapshotFiles),
    );
    const check = Effect.fn("SnapshotCompilation.check")(function* (root, inputs, tools) {
      const current = yield* readSnapshotCheckReceipt(root, inputs, tools).pipe(
        Effect.provide(authorities),
      );
      if (current !== undefined) return current;
      return yield* checkSnapshotProjectEffect({ projectRoot: root, mode: "development" }).pipe(
        Effect.provide(authorities),
      );
    });
    const buildChecked = Effect.fn("SnapshotCompilation.buildChecked")(
      (root: string, directory: string, checked: CheckResult) =>
        buildProjectEffect({
          projectRoot: root,
          buildDirectory: directory,
          mode: "production",
          bundleInputInventory: "bun.inputs.json",
          check: () => Promise.resolve(checked),
        }).pipe(Effect.provide(authorities)),
    );
    return { check, buildChecked } satisfies SnapshotCompilationOperations;
  }),
}) {}

/** Supplies preparation policy from already acquired CLI authorities. */
export const snapshotCompilationLive = Layer.effect(SnapshotCompilation, SnapshotCompilation.make);
