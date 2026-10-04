import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runWatchFeed } from "./watch-feed-loop.js";
import type { JobObservationService } from "./observation.types.js";

/** Cohesive native/polling observation workflow, replaceable at the feed owner. */
export class JobObservation extends Context.Service<JobObservation, JobObservationService>()(
  "relkit/client/JobObservation",
) {}

/**
 * Acquires the live observation workflow; native dependencies are supplied by each feed.
 * @returns A synchronously acquired Layer whose consume Effect owns reconnect and pull state.
 * @remarks Consume is lazy, preserves native failures, and is interrupted by its feed owner.
 * @see tests/jobs/quality.test.ts for checked observation, recovery and interruption cases.
 */
export const JobObservationLive = Layer.effect(
  JobObservation,
  Effect.succeed(
    JobObservation.of({
      /** Runs the scoped watch or polling state machine.
       * @param feed - Complete native transport, security and state authority.
       * @param generation - Active worker generation used to reject stale callbacks.
       * @returns A lazy interruptible workflow until terminal confirmation or retirement. */
      consume: Effect.fn("JobObservation.observe")((feed, generation) =>
        observeExecution("client", "jobs.observe", runWatchFeed(feed, generation)),
      ),
    }),
  ),
);
