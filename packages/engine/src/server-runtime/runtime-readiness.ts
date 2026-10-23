/** Publishes readiness and reads state without reviving a generation after shutdown starts. */
import { Deferred, Effect, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import type { RuntimeServiceState } from "./runtime-service-state.types.js";
import type { RuntimeArea } from "./server-runtime.types.js";

/** @param owner - Generation-owned state and physical receipts. @returns Current state with the actual pending completion count. */
export const runtimeSnapshot = Effect.fn("ServerRuntime.snapshot")(
  (owner: RuntimeServiceState) =>
    Ref.get(owner.state).pipe(
      Effect.map((value) => ({ ...value, pendingInvocations: Ref.getUnsafe(owner.active).size })),
    ),
  (effect) => observeExecution("runtime", "server.snapshot", effect),
);

/** @param owner - Generation-owned state and gates. @param area - Health dimension. @param ready - Published result. @returns Atomic publication that cannot revive stopping state. */
export const publishRuntimeReadiness = Effect.fn("ServerRuntime.setReady")(
  function* (owner: RuntimeServiceState, area: RuntimeArea, ready: boolean) {
    const value = yield* Ref.updateAndGet(owner.state, (current) =>
      current.stopping ? current : { ...current, ready: { ...current.ready, [area]: ready } },
    );
    if (value.ready[area]) yield* Deferred.succeed(owner.readiness[area], undefined);
  },
  (effect) => observeExecution("runtime", "server.readiness", effect),
);

/** @param owner - Generation-owned one-shot gates. @param area - Required health dimension. @returns Interruptible publication wait. */
export const awaitRuntimeReadiness = Effect.fn("ServerRuntime.awaitReady")(
  (owner: RuntimeServiceState, area: RuntimeArea) => Deferred.await(owner.readiness[area]),
  (effect) => observeExecution("runtime", "server.await-ready", effect),
);
