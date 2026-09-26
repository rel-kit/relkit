import { abortablePromiseEffect, createAbortBridgeEffect } from "@relkit/invocation";
import { Effect } from "effect";
import type { FunctionToolApprovalRequest, FunctionToolInvokeOptions } from "./function-tool.js";
import {
  FunctionToolApprovalDeniedError,
  FunctionToolApprovalRequiredError,
} from "./function-tool-errors.js";
import {
  FunctionToolApprovalDeniedFailure,
  FunctionToolApprovalRequiredFailure,
  FunctionToolCancelledFailure,
} from "./function-tool-failures.js";
import { FunctionOperationError } from "./function-observability.js";
/** Resolves approval within the owning invocation's span and resource scope.
 * @param approval - Tool identity and approval policy.
 * @param options - Resolver and optional caller cancellation signal.
 * @returns Approval success, or a tagged required, denied, cancelled, or resolver failure.
 * @example yield* resolveFunctionToolApprovalEffect(request, { approval: () => true });
 */
export const resolveFunctionToolApprovalEffect = Effect.fn("functions.tool.resolve-approval")(
  (approval: FunctionToolApprovalRequest, options: FunctionToolInvokeOptions) =>
    Effect.gen(function* () {
      const required =
        approval.policy === "always" ||
        (approval.policy === "on-write" &&
          approval.sideEffect !== "none" &&
          approval.sideEffect !== "read");
      if (!required) return;
      const resolver = options.approval;
      if (resolver === undefined)
        return yield* Effect.fail(
          new FunctionToolApprovalRequiredFailure({
            approval,
            cause: new FunctionToolApprovalRequiredError(approval),
          }),
        );
      const decision = yield* Effect.acquireUseRelease(
        Effect.gen(function* () {
          const interruptController = new AbortController();
          const bridge = yield* createAbortBridgeEffect(interruptController.signal, options.signal);
          return { interruptController, bridge };
        }),
        ({ interruptController, bridge }) =>
          Effect.onInterrupt(
            abortablePromiseEffect(bridge.signal, (signal) =>
              Promise.resolve(resolver(approval, signal)),
            ).pipe(
              Effect.mapError((error) =>
                error.kind === "aborted"
                  ? new FunctionToolCancelledFailure({ cause: error.cause })
                  : new FunctionOperationError({ operation: "tool.invoke", cause: error.cause }),
              ),
            ),
            () => Effect.sync(() => interruptController.abort()),
          ),
        ({ bridge }) => bridge.disposeEffect(),
      );
      if (decision !== true && decision !== "approved")
        return yield* Effect.fail(
          new FunctionToolApprovalDeniedFailure({
            approval,
            cause: new FunctionToolApprovalDeniedError(approval),
          }),
        );
    }),
);
