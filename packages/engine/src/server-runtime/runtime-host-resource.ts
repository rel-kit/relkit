/**
 * Registers native release before initialization and tracks uncancellable completion.
 * A late handle is released exactly once before its acquisition rejects cancellation.
 */
import { Effect } from "effect";
import { ExecutionSuccessLogs } from "@relkit/contracts/operation";
import { ServerRuntimeFailure } from "./server-runtime.schemas.js";
import {
  externalRuntimeCallback,
  runRuntimeHost,
  trackRuntimeHostCallback,
} from "./runtime-host-native.js";
import { reportLateHostFailure } from "./runtime-host-late.js";
import type { RuntimeHostState } from "./runtime-host-state.types.js";
import type { ServerRuntimeHost } from "./server-runtime-host.types.js";

/** @param owner - Host generation authority. @returns Native resource acquisition preserving the public callback contract. */
export function runtimeHostResource(owner: RuntimeHostState): ServerRuntimeHost["resource"] {
  return (
    operation,
    acquire,
    release,
    initialize = () => undefined,
    phase = "application",
    successLogs = true,
  ) =>
    runRuntimeHost(
      owner,
      owner.service.resource(
        operation,
        Effect.acquireRelease(
          externalRuntimeCallback(owner, operation, (signal) =>
            acquireHostHandle(owner, operation, signal, acquire, release),
          ).pipe(Effect.provideService(ExecutionSuccessLogs, successLogs)),
          (value) =>
            owner.service.cleanup(
              operation + ".release",
              externalRuntimeCallback(owner, operation + ".release", async () => {
                await release(value);
              }),
            ),
          { interruptible: true },
        ),
        (value) =>
          externalRuntimeCallback(owner, operation, async () => {
            await trackRuntimeHostCallback(owner, async () => {
              await initialize(value);
            });
          }),
        phase,
      ),
    );
}

/** @typeParam A - Native handle. @typeParam Released - Release callback completion. @param owner - Host generation. @param operation - Startup identity. @param signal - Combined owner/caller signal. @param acquire - Physical native acquisition. @param release - Exactly-once late release. @returns Original handle or cancellation after late cleanup. */
function acquireHostHandle<A, Released>(
  owner: RuntimeHostState,
  operation: string,
  signal: AbortSignal,
  acquire: (signal: AbortSignal) => Promise<A>,
  release: (value: A) => Promise<Released> | void,
): Promise<A> {
  return trackRuntimeHostCallback(owner, () =>
    acquire(signal).then(async (value) => {
      if (signal.aborted) {
        try {
          await release(value);
        } catch (cause) {
          await reportLateHostFailure(
            owner,
            new ServerRuntimeFailure({ operation: operation + ".late-release", cause }),
          );
        }
        throw signal.reason;
      }
      return value;
    }),
  );
}
