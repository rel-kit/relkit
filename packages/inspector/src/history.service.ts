/** Owns the existing isolated DuckDB worker and preserves its transactional receipt semantics. */
import { Cause, Context, Effect, Layer } from "effect";
import type { InspectorHistoryOperations } from "./history.types.js";
import { InspectorHistoryNative, historyNativeFailure } from "./history-native.service.js";
import { validateHistoryReply } from "./history-reply.js";
import { observeExecution } from "@relkit/contracts/operation";

/** Persistent history opens only inside the standalone tool's Scope. */
export class InspectorHistory extends Context.Service<
  InspectorHistory,
  InspectorHistoryOperations
>()("relkit/inspector/History", {
  make: (root: string, projectId: string) =>
    Effect.gen(function* () {
      const native = yield* InspectorHistoryNative;
      const worker = yield* native.acquire(root, projectId);
      return {
        call: (command) =>
          observeExecution(
            "inspector",
            `history.${command.type}`,
            worker.call(command).pipe(
              Effect.catchCause((cause) =>
                Effect.failCause(Cause.map(cause, historyNativeFailure)),
              ),
              Effect.tap((value) => validateHistoryReply(command, value)),
            ),
            () => ({
              commands: 1,
              records: command.type === "append" ? command.records.length : 0,
            }),
          ),
      } satisfies InspectorHistoryOperations;
    }).pipe((effect) =>
      observeExecution("inspector", "history.open", effect, () => ({ writers: 1 })),
    ),
}) {}

/** Supplies exactly one native writer owner for the selected project. */
export function inspectorHistoryLayer(root: string, projectId: string) {
  return Layer.effect(InspectorHistory, InspectorHistory.make(root, projectId));
}
