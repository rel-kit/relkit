import { Cause, Effect, Exit, Layer, ManagedRuntime, Metric } from "effect";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import { createDrainLayer } from "./drain-service.js";
import { validateDrainOptions } from "./drain-validation.js";
import {
  validatePreviousGeneration,
  drainPreviousGenerationWorkflow,
} from "./drain-state-service.js";
import type { DrainPreviousGenerationOptions, SupervisorDrainReport } from "./drain.types.js";

/**
 * Drains the recorded retired generation and completes its existing state transition.
 * @param options - Active/retired witnesses, native owners and shared deadline policy.
 * @returns Immutable cleanup evidence; stale completion never replaces the active generation.
 */
export async function drainPreviousGeneration(
  options: DrainPreviousGenerationOptions,
): Promise<SupervisorDrainReport> {
  const admitted = Effect.runSyncExit(validatePreviousGeneration(options));
  if (Exit.isFailure(admitted)) throw Cause.squash(admitted.cause);
  const deadline = validateDrainOptions(options, 60_000);
  const owner = ManagedRuntime.make(
    Layer.mergeAll(
      createDrainLayer(options, deadline),
      createLoggerLayer({ component: "supervisor", ...options.logger }),
      Layer.succeed(Metric.MetricRegistry, new Map()),
    ),
  );
  try {
    const exit = await owner.runPromiseExit(drainPreviousGenerationWorkflow(options));
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
    return exit.value;
  } finally {
    await owner.dispose();
  }
}
