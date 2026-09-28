import type { PublicLogger } from "@relkit/invocation";
import type { Effect } from "effect";
import type { ConstantResolver } from "./context-descriptors.types.js";
import type { ContextResolutionFailure } from "./context-resolver.js";

/** Replaceable execution boundary for dynamic constant callbacks.
 * @example const runner: AppConstantRunnerService = { run: () => Effect.succeed("eu") };
 */
export interface AppConstantRunnerService {
  /** Invokes a dynamic constant resolver.
   * @param resolver - User supplied constant callback.
   * @param options - Environment, logger, and caller signal available to the callback.
   * @returns The callback result or ContextResolutionFailure.
   * @example runner.run(() => "eu", { env: {}, log });
   */
  readonly run: (
    resolver: ConstantResolver,
    options: {
      readonly env: Readonly<Record<string, unknown>>;
      readonly log: PublicLogger;
      readonly signal: AbortSignal;
    },
  ) => Effect.Effect<unknown, ContextResolutionFailure>;
}
