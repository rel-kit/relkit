/**
 * The warm development checker: one process per `relkit dev` session that answers every
 * check request of the session over IPC. It checks without type-checking (a parallel
 * `tsc --watch` reports types) and evaluates through the warm evaluator, telling it which
 * sources changed since the previous check and, through the previous compilation's watch
 * dependency index (`invalidateWatchDependencies`), which descriptors depend on them.
 * Requests are answered in order; the process exits when its parent disconnects, and the
 * parent's process-group release reaps the warm evaluator with it.
 */
import { statSync } from "node:fs";
import { Cause, Effect, Schema } from "effect";
import {
  createWarmEvaluator,
  invalidateWatchDependencies,
  retainParsedSources,
} from "../compiler/index.js";
import type { WatchDependencyIndex } from "../compiler/index.js";
import { checkProjectEffect } from "./check.js";
import { devCheckRequestSchema } from "./dev-check.schemas.js";
import { projectCapabilitiesLayer } from "../services/project-capabilities.js";
import { cliTry } from "../cli-errors.js";
import { runCliEffect } from "../cli-runtime.js";
import type { DevCheckResponse } from "./dev-check.types.js";

// Saves usually change one file; every other file keeps its syntax tree and resolutions.
retainParsedSources();
const warm = createWarmEvaluator();
let index: WatchDependencyIndex | undefined;
const stamps = new Map<string, string>();

/**
 * Lists indexed sources whose file changed since the previous check, with descriptor dependents.
 * @param projectRoot - Application root.
 * @returns Project-relative files the warm evaluator must import again.
 */
function invalidatedSources(projectRoot: string): readonly string[] {
  if (index === undefined) return [];
  const changed = [...index.sourceFiles.keys()].filter(
    (file) => stamps.get(file) !== stampOf(`${projectRoot}/${file}`),
  );
  if (changed.length === 0) return [];
  const invalidation = invalidateWatchDependencies(index, changed, projectRoot);
  return [...new Set([...changed, ...invalidation.affectedFiles])].sort();
}

/**
 * Records the stamp of every indexed source after a check.
 * @param projectRoot - Application root.
 * @param next - Watch dependency index of the check just finished.
 */
function recordSources(projectRoot: string, next: WatchDependencyIndex): void {
  index = next;
  stamps.clear();
  for (const file of next.sourceFiles.keys()) stamps.set(file, stampOf(`${projectRoot}/${file}`));
}

/**
 * Reads a file's modification stamp.
 * @param file - Absolute path.
 * @returns Modification time and size, or `missing`.
 */
function stampOf(file: string): string {
  try {
    const stats = statSync(file);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return "missing";
  }
}

/**
 * Answers one check request.
 * @param message - Untrusted IPC request.
 * @returns The response, with failures framed rather than thrown.
 */
const answer = Effect.fn("Dev.checkWorker.answer")(function* (message: object) {
  const request = yield* cliTry("dev.compiler.request", () => {
    if (!Schema.is(devCheckRequestSchema)(message))
      throw new TypeError("Development compiler request is invalid.");
    return message;
  });
  const invalidate = invalidatedSources(request.projectRoot);
  let reimported: readonly string[] = [];
  const result = yield* checkProjectEffect({
    ...request,
    mode: "development",
    typecheck: false,
    evaluate: (options) =>
      warm.evaluate(options, invalidate).pipe(
        Effect.map((evaluation) => {
          reimported = evaluation.reimported;
          return evaluation.response;
        }),
      ),
    onWatchIndex: (next) => recordSources(request.projectRoot, next),
  });
  return { id: request.id, result, reimported } satisfies DevCheckResponse;
});

let queue = Promise.resolve();
process.on("message", (message: object) => {
  // One check at a time: the warm evaluator and the source stamps are shared state.
  queue = queue.then(async () => {
    const response = await runCliEffect(
      answer(message).pipe(
        Effect.catchCause((cause) =>
          Effect.succeed<DevCheckResponse>({ id: idOf(message), error: Cause.pretty(cause) }),
        ),
      ),
      projectCapabilitiesLayer,
    );
    process.send?.(response);
  });
});
process.on("disconnect", () => {
  warm.close();
  process.exit(0);
});

/**
 * Reads the correlation ID of a request that failed validation.
 * @param message - IPC message.
 * @returns Its numeric `id`, or -1.
 */
function idOf(message: object): number {
  const id = (message as { readonly id?: number }).id;
  return typeof id === "number" ? id : -1;
}
