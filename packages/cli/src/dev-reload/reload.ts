/**
 * Decides, for one save, between swapping handlers in the serving process, keeping the
 * last known good generation, and the blue/green restart. Restart-class paths skip the
 * check entirely. Otherwise the warm checker re-evaluates the changed modules; a failing
 * check is reported with its source locations and leaves the previous handlers serving; a
 * check whose configuration, bindings and graph shape match the serving generation is
 * swapped in place; anything else is handed to blue/green with the check already done, so
 * the restart does not evaluate the sources a second time.
 */
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { Effect, Ref } from "effect";
import { redactFailureDetail } from "relkit/runtime-effect";
import { observeCli } from "../cli-runtime.js";
import { formatDevDiagnostics } from "../commands/dev-local-diagnostics.js";
import type { CheckResult } from "../commands/check-result.types.js";
import type { DevCompilerOptions } from "../commands/dev-local.types.js";
import type { DevGenerationState } from "../commands/dev-local-generation.types.js";
import type { CliProject } from "../services/project.service.js";
import { restartReason } from "./reload-classify.js";
import { swapBlocker } from "./reload-eligibility.js";
import { swapServingGeneration } from "./reload-swap.js";
import type { DevReloadOutcome, DevReloadRequest } from "./reload.types.js";

/**
 * Builds the reload operation for one session compiler.
 * @param options - Project root and diagnostic colour policy.
 * @param state - Compiler state holding each generation's check.
 * @param project - Captured project capabilities.
 * @returns The reload operation; it never fails.
 */
export function makeDevReload(
  options: DevCompilerOptions,
  state: DevGenerationState,
  project: CliProject["Service"],
) {
  // The native watcher can report one write several times; a save whose files still have
  // the stamps of the last decided save repeats that decision instead of checking again.
  let last: { readonly key: string; readonly outcome: DevReloadOutcome } | undefined;
  const decide = Effect.fn("Dev.reload.decide")(function* (request: DevReloadRequest) {
    const key = changeKey(options.projectRoot, request.changedFiles);
    if (last !== undefined && last.key === key && last.outcome !== "restart") return last.outcome;
    const outcome = yield* reload(request);
    last = { key, outcome };
    return outcome;
  });
  const reload = Effect.fn("Dev.reload")(
    function* (request: DevReloadRequest) {
      const startedAt = performance.now();
      const reason = restartReason(options.projectRoot, request.changedFiles);
      if (reason !== undefined) return restart(request, reason);
      const previous = (yield* Ref.get(state.checks)).get(request.candidate.token.generationToken);
      if (previous === undefined) return restart(request, "the serving generation has no check");
      const checked = yield* project
        .checkDevelopment({
          projectRoot: options.projectRoot,
          generationId: `dev-reload-${request.version}`,
        })
        .pipe(Effect.result);
      if (checked._tag === "Failure") return restart(request, checked.failure.message);
      if (!checked.success.ok) return reportFailure(options, request, checked.success);
      const blocker = swapBlocker(previous, checked.success);
      if (blocker !== undefined) return yield* handOver(state, request, checked.success, blocker);
      return yield* swap(options, state, request, checked.success, startedAt);
    },
    (effect, request) =>
      observeCli("dev.reload", effect, () => ({ files: request.changedFiles.length })),
  );
  return decide;
}

/**
 * Identifies a save by its changed files and their current modification stamps.
 * @param projectRoot - Application root.
 * @param files - Changed project-relative paths.
 * @returns Stable key; equal keys mean no file changed in between.
 */
function changeKey(projectRoot: string, files: readonly string[]): string {
  return [...files]
    .sort()
    .map((file) => {
      try {
        const stats = statSync(resolve(projectRoot, file));
        return `${file}:${stats.mtimeMs}:${stats.size}`;
      } catch {
        return `${file}:missing`;
      }
    })
    .join("\n");
}

/**
 * Applies a swap and records the new check against the serving generation.
 * @param options - Project root.
 * @param state - Compiler state.
 * @param request - The save.
 * @param checked - Accepted check of the saved sources.
 * @param startedAt - Monotonic start of the reload.
 * @returns `swapped`, or `restart` when the server refused.
 */
const swap = Effect.fn("Dev.reload.apply")(function* (
  options: DevCompilerOptions,
  state: DevGenerationState,
  request: DevReloadRequest,
  checked: CheckResult,
  startedAt: number,
) {
  const reply = yield* swapServingGeneration({
    candidate: request.candidate,
    checked,
    version: request.version,
    projectRoot: options.projectRoot,
    signal: request.signal,
  }).pipe(Effect.result);
  if (reply._tag === "Failure")
    return yield* handOver(state, request, checked, reply.failure.message);
  if (!reply.success.ok) return yield* handOver(state, request, checked, reply.success.error);
  yield* Ref.update(
    state.checks,
    (checks) => new Map([...checks, [request.candidate.token.generationToken, checked]]),
  );
  request.log({
    level: "info",
    event: "dev.generation.swapped",
    fields: {
      version: request.version,
      changedFiles: request.changedFiles.length,
      reimported: [...reply.success.reimported],
      pid: reply.success.pid,
      durationMs: performance.now() - startedAt,
    },
  });
  return "swapped" satisfies DevReloadOutcome;
});

/**
 * Hands an accepted check to the blue/green path, which reuses it instead of checking again.
 * @param state - Compiler state whose reusable check slot the next compile consumes.
 * @param request - The save.
 * @param checked - Accepted check.
 * @param reason - Why the swap was not possible.
 * @returns `restart`.
 */
const handOver = Effect.fn("Dev.reload.handOver")(function* (
  state: DevGenerationState,
  request: DevReloadRequest,
  checked: CheckResult,
  reason: string,
) {
  yield* Ref.set(state.initialCheck, Effect.succeed(checked));
  return restart(request, reason);
});

/**
 * Logs why a save restarts.
 * @param request - The save.
 * @param reason - Restart reason.
 * @returns `restart`.
 */
function restart(request: DevReloadRequest, reason: string): DevReloadOutcome {
  request.log({
    level: "debug",
    event: "dev.reload.restart",
    fields: { version: request.version, reason },
  });
  return "restart";
}

/**
 * Reports a failed check with its source locations; the previous handlers keep serving.
 * @param options - Project root and colour policy.
 * @param request - The save.
 * @param checked - Failed check.
 * @returns `failed`.
 */
function reportFailure(
  options: DevCompilerOptions,
  request: DevReloadRequest,
  checked: CheckResult,
): DevReloadOutcome {
  const message = formatDevDiagnostics(options.projectRoot, checked.diagnostics, options.color);
  request.log({
    level: "error",
    event: "dev.generation.failed",
    fields: {
      message,
      error: redactFailureDetail(new Error(message), undefined, 0, true),
      previousActive: true,
    },
  });
  return "failed";
}
