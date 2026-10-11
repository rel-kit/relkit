/**
 * Watches project inputs before initial compilation and lends its result to only
 * the first unchanged generation. CliProject owns compilation; a child Scope
 * closes the native watch on consumption, startup failure or command shutdown.
 */
import { Effect, Exit, Ref, Scope } from "effect";
import { observeCli } from "../cli-runtime.js";
import { CliProject } from "../services/project.service.js";
import { CliSourceWatch } from "../services/source-watch.service.js";
import { CliCleanup, cleanupEffect } from "../services/cleanup.service.js";

/**
 * Watches before checking so edits during validation or support acquisition invalidate reuse.
 * @param projectRoot - Authored project whose initial check owns its compiler process group.
 * @returns The initial diagnostics and a single-use, edit-fenced compilation result.
 */
export const checkInitialDevProjectEffect = Effect.fn("Dev.initialCheck")(
  function* (projectRoot: string) {
    const project = yield* CliProject;
    const watches = yield* CliSourceWatch;
    const cleanup = yield* CliCleanup;
    const available = yield* Ref.make(true);
    let changed = false;
    const watchScope = yield* Scope.fork(yield* Scope.Scope);
    yield* Effect.acquireRelease(
      watches.watch(
        projectRoot,
        true,
        (filename) => {
          const first = filename.replaceAll("\\", "/").split("/")[0];
          if (![".git", ".relkit", ".next"].includes(first ?? "")) changed = true;
        },
        () => {
          changed = true;
        },
      ),
      (close) => cleanupEffect("dev.initial.watch.release", Effect.sync(close)),
    ).pipe(Effect.provideService(Scope.Scope, watchScope));
    const checked = yield* project.checkDevelopment({
      projectRoot,
      generationId: `dev-initial-${crypto.randomUUID()}`,
    });
    return {
      checked,
      discard: Ref.set(available, false).pipe(Effect.andThen(Scope.close(watchScope, Exit.void))),
      take: Effect.fn("Dev.takeInitialCheck")(function* () {
        if (!(yield* Ref.getAndSet(available, false))) return undefined;
        yield* Scope.close(watchScope, Exit.void);
        return changed ? undefined : checked;
      })().pipe(Effect.provideService(CliCleanup, cleanup)),
    };
  },
  (effect) => observeCli("dev.initial.check", effect),
);
