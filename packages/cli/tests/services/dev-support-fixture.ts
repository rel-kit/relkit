/**
 * Supplies deterministic engine authorities without listeners or native children.
 * Backend activation is an explicit successful test receipt; inspector behavior
 * is injected separately so barriers prove ownership and independence of support.
 */
import { Deferred, Effect, Layer } from "effect";
import { CliDevSupervisor } from "../../src/services/dev-supervisor.service.js";
import { CliSourceWatch } from "../../src/services/source-watch.service.js";
import { cleanupLayer } from "../../src/services/cleanup.service.js";
import { CliPortProbe } from "../../src/commands/port-availability.service.js";
import { CliInspectorSupport } from "../../src/commands/dev-inspector-support.service.js";
import { acquireDevEngineState } from "../../src/commands/dev-engine-state.js";
import { startDevEngine } from "../../src/commands/dev-engine-start.js";
import { stopDevEngine } from "../../src/commands/dev-engine-stop.js";
import { filesystemTestLayer } from "./test-layers.js";
import type { DevSession } from "../../src/commands/dev-session.js";
import type { DevSessionEngine } from "../../src/commands/dev-session.types.js";
import type { DevInspectorSupportOperations } from "../../src/commands/dev-inspector-support.types.js";

/**
 * Builds a complete substitute authority graph with accidental native work rejected.
 * @param run - Scoped inspector behavior controlled by deterministic barriers.
 * @returns Test Layers sharing no resources with another session.
 */
export function devSupportTestLayer(run: DevInspectorSupportOperations["run"]) {
  const forbidden = () => Effect.die(new Error("Unexpected native operation in support test"));
  return Layer.mergeAll(
    cleanupLayer,
    filesystemTestLayer(),
    Layer.succeed(CliInspectorSupport, { run }),
    Layer.succeed(CliPortProbe, { check: () => Effect.void }),
    Layer.succeed(CliSourceWatch, { watch: forbidden, poll: forbidden }),
    Layer.succeed(CliDevSupervisor, {
      start: forbidden,
      verify: forbidden,
      dispose: forbidden,
      drain: forbidden,
      listen: () => Effect.void,
      stopProxy: () => Effect.void,
    }),
  );
}

/**
 * Assembles only the backend/support engine boundary under the supplied test graph.
 * @param session - Purely constructed facade; no real listener is acquired.
 * @returns Engine and ownership state released by the caller's test Scope.
 */
export const devSupportFixture = Effect.fn("Test.devSupportFixture")(function* (
  session: DevSession,
) {
  const owner = yield* acquireDevEngineState();
  const worker = yield* Effect.forkIn(Effect.never, owner.scope);
  const activate = () => Effect.succeed(true);
  const stop = <Reason>(reason?: Reason) => stopDevEngine(owner, session, worker, reason);
  const requestStop = <Reason>(reason: Reason): void => {
    Deferred.doneUnsafe(owner.requested, stop(reason));
  };
  const engine: DevSessionEngine = {
    scope: owner.scope,
    cleanup: owner.cleanup,
    queue: owner.queue,
    worker,
    activate,
    stop,
    requestStop,
    start: startDevEngine(owner, session, { activate, stop, requestStop }),
    wait: Deferred.await(owner.closed),
    watch: Effect.never,
    drain: () => Effect.void,
    finish: () => {
      Deferred.doneUnsafe(owner.closed, Effect.void);
    },
  };
  session.attach(engine);
  yield* Effect.addFinalizer(() => stop());
  return { owner, engine };
});
