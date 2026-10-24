/** Keeps history acquisition attached to the tool and hides retiring writers before native cleanup. */
import { join } from "node:path";
import { Effect, Exit, Ref, Scope } from "effect";
import { InspectionConnectionError } from "@relkit/inspector-api/connection";
import type { InspectionFilesOperations } from "@relkit/inspector-api/connection";
import { InspectorHistory } from "./history.service.js";
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
  const operations = yield* InspectorHistory.make(
    options.historyDirectory ?? join(options.projectRoot ?? process.cwd(), ".relkit/observability"),
    projectId,
  ).pipe(
    Scope.provide(scope),
    Effect.onExit((exit) => (Exit.isSuccess(exit) ? Effect.void : Scope.close(scope, exit))),
  );
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
    error: error.operation,
    incomplete: true,
    ...(historyFailure ? { history: undefined } : {}),
    ...(error.operation === "history.foreign-project"
      ? { selection: { state: "disconnected" as const, rejected: 1 } }
      : {}),
  }));
  if (historyFailure && current.history) yield* Scope.close(current.history.scope, Exit.void);
  yield* Effect.sleep(1000);
});
