/** Stops admission before aborting and joining every native invocation and model owner. */
import { Context, Deferred, Effect, Ref } from "effect";
import { joinOwnedWork, runOwnedContext } from "@relkit/testing/internal/work-ownership";
import type { AgentHarnessDependencies } from "./agent-harness.types.js";

export function agentHarnessClose(
  context: Context.Context<never>,
  harness: AgentHarnessDependencies,
) {
  const { state, approvals, model } = harness;
  return Effect.uninterruptible(
    Effect.fn("Testing.agent.close")(function* () {
      const current = Ref.getUnsafe(state);
      if (current.closing !== undefined)
        return yield* Effect.tryPromise({
          try: () => current.closing!,
          catch: (cause) => cause,
        });
      const done = yield* Deferred.make<void, unknown>();
      current.closing = runOwnedContext(context, Deferred.await(done));
      void current.closing.catch(() => undefined);
      current.closed = true;
      return yield* Effect.gen(function* () {
        approvals.reset();
        yield* Effect.forEach(
          [...current.active],
          (controller) => Effect.sync(() => controller.abort(new Error("Test agent closed"))),
          { concurrency: 1, discard: true },
        );
        current.active.clear();
        yield* joinOwnedWork(current.pending);
        yield* Effect.tryPromise({ try: () => model.close(), catch: (cause) => cause });
      }).pipe(Effect.onExit((exit) => Deferred.done(done, exit)));
    })(),
  );
}

export function resetAgentHarness(harness: AgentHarnessDependencies): void {
  const { state, model, trace, approvals } = harness;
  for (const controller of Ref.getUnsafe(state).active)
    controller.abort(new Error("Test agent reset"));
  Ref.getUnsafe(state).active.clear();
  model.reset();
  trace.clear();
  approvals.reset();
  Ref.getUnsafe(state).invocationSequence = 0;
}
