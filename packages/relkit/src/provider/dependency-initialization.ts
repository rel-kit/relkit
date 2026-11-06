/** Owns the native import edge while preserving its original initialization cause. */
import { Effect } from "effect";
import { SelectedDependencyInitializationFailure } from "./dependency-preflight.errors.js";
import { observeProvider } from "./provider-observability.js";

/** Evaluates only a preflighted literal import supplied by the owning producer. */
export const initializeIntegration = Effect.fn("SelectedDependencies.initialize")(
  <Module>(packageName: string, load: () => Promise<Module>) =>
    Effect.tryPromise({
      try: load,
      catch: (cause) =>
        new SelectedDependencyInitializationFailure({
          package: packageName,
          cause:
            cause instanceof Error
              ? cause
              : new Error("Native module initialization failed", { cause }),
        }),
    }).pipe(Effect.uninterruptible),
  (effect) => observeProvider("dependency.initialize", effect),
);
