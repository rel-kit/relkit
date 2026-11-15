/** Keeps history acquisition attached to the tool and hides retiring writers before native cleanup. */
import { join } from "node:path";
import { Effect, Exit, Ref, References, Scope } from "effect";
import { InspectionConnectionError } from "relkit/inspector-api/connection";
import type { InspectionFilesOperations } from "relkit/inspector-api/connection";
import { InspectorHistory } from "./history.service.js";
import type { InspectorHistoryOperations } from "./history.types.js";
import { publishHistoryOwner, removeHistoryOwner, type HistoryOwner } from "./history-owner.js";
import type { InspectorOptions } from "./options.types.js";
import type { InspectorToolStateRef } from "./tool-state.types.js";

/** Opens legacy project history in a parent-owned child Scope and rejects cross-project reuse. */
export const acquireHistory = Effect.fn("Inspector.acquireHistory")(function* (
  state: InspectorToolStateRef,
  files: InspectionFilesOperations,
  options: InspectorOptions,
) {
  const current = yield* Ref.get(state);
  if (current.history) {
    if (
      current.selection.state === "connected" &&
      current.history.projectId !== current.selection.connection.descriptor.projectId
    )
      return yield* new InspectionConnectionError({
        operation: "history.foreign-project",
        cause: new Error("Choose a project-specific history directory"),
      });
    return;
  }
  let projectId: string | undefined;
  if (current.selection.state === "connected")
    projectId = current.selection.connection.descriptor.projectId;
  else if (options.connectionFile === undefined || options.projectRoot !== undefined)
    projectId = yield* files.projectId(options.projectRoot ?? process.cwd());
  if (projectId === undefined) return;
  const scope = yield* Scope.fork(yield* Effect.scope);
  const root = historyRoot(options);
  // A refused opening is reported once by the loop; its own failure record would repeat it.
  const operations = yield* InspectorHistory.make(root, projectId).pipe(
    quiet,
    Scope.provide(scope),
    Effect.onExit((exit) => (Exit.isSuccess(exit) ? Effect.void : Scope.close(scope, exit))),
  );
  // Another Inspector for this project that cannot open the history reads who holds it here.
  yield* publishHistoryOwner(root, options);
  yield* Scope.addFinalizer(scope, removeHistoryOwner(root));
  yield* Ref.update(state, (value) => ({ ...value, history: { projectId, scope, operations } }));
});

/** Recovery detaches unavailable history and its connection fence before awaiting a slow close. */
export const recoverInspection = Effect.fn("Inspector.recover")(function* (
  state: InspectorToolStateRef,
  error: InspectionConnectionError,
) {
  const historyFailure = error.operation.startsWith("history.");
  const current = yield* Ref.get(state);
  yield* Ref.update(state, (value) => ({
    ...value,
    // A failure loses no record by itself: the application keeps what was not acknowledged,
    // and the next batch reports a gap if its buffer evicted any meanwhile.
    error: error.operation,
    ...(historyFailure ? { history: undefined } : {}),
    ...(error.operation === "history.foreign-project"
      ? { selection: { state: "disconnected" as const, rejected: 1 } }
      : {}),
  }));
  if (historyFailure && current.history) yield* Scope.close(current.history.scope, Exit.void);
  yield* Effect.sleep(1000);
});

/**
 * The directory that holds a project's history.
 * @param options - Launch options.
 * @returns The configured history directory, or the project's `.relkit/observability`.
 */
export function historyRoot(options: InspectorOptions): string {
  return (
    options.historyDirectory ?? join(options.projectRoot ?? process.cwd(), ".relkit/observability")
  );
}

/** Runs an operation without log records; its failure is reported once by the collection loop. */
export const quiet = Effect.provideService(References.MinimumLogLevel, "None");

/**
 * Wraps history operations so their failures leave no log records of their own.
 * @param operations - History operations of one open history.
 * @returns The same operations, silent when they fail.
 */
export function quietHistory(operations: InspectorHistoryOperations): InspectorHistoryOperations {
  return { call: (command) => operations.call(command).pipe(quiet) };
}

/**
 * Says what is wrong with the history and what to do. A lock conflict names the other holder:
 * DuckDB reports its PID, and only that number is echoed, never the file path or the rest of the
 * message. Any other failure is named by its code alone.
 * @param error - The history failure.
 * @param owner - The Inspector that recorded itself as the holder, when it is still running.
 * @returns One notice for the terminal, or undefined when the failure is not about history.
 */
export function historyFailureHint(
  error: InspectionConnectionError,
  owner?: HistoryOwner,
): string | undefined {
  if (!error.operation.startsWith("history.")) return undefined;
  if (error.operation !== "history.writer-conflict")
    return `Inspection history is unavailable (${error.operation}); this Inspector runs without it`;
  const pid = /\bPID (\d+)/.exec(error.cause.message)?.[1];
  const holder =
    owner === undefined
      ? `Another process already holds this project's history${pid ? ` (PID ${pid})` : ""}`
      : `Another Inspector already holds this project's history (${pid ? `PID ${pid}, ` : ""}listening at ${owner.url})`;
  return `${holder}. This Inspector runs without history. Stop the other one, or pass --history-directory`;
}
