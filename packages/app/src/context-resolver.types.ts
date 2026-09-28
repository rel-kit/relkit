import type { PublicLogger } from "@relkit/invocation";
import type { Effect } from "effect";
import type {
  ConstantsDescriptor,
  PromptDescriptor,
  PromptValue,
} from "./context-descriptors.types.js";
import type { AppConstantRunner } from "./context-resolution-service.js";
import type { ContextResolutionFailure } from "./context-resolver.js";

/** Static and dynamic descriptor inputs for one context resolver.
 * @example const options: ApplicationContextOptions = { env: {} };
 */
export interface ApplicationContextOptions {
  readonly constants?: Readonly<Record<string, ConstantsDescriptor>>;
  readonly prompts?: Readonly<Record<string, PromptDescriptor>>;
  readonly env: Readonly<Record<string, unknown>>;
}

/** Invocation inputs required to resolve dynamic constants.
 * @example const context: ApplicationResolveOptions = { signal, log };
 */
export interface ApplicationResolveOptions {
  readonly signal: AbortSignal;
  readonly log: PublicLogger;
}

/** Context values produced by a resolver invocation.
 * @example const constants = resolved.constants;
 */
export interface ResolvedApplicationContext {
  readonly constants: Readonly<Record<string, unknown>>;
  readonly prompts: Readonly<Record<string, PromptValue>>;
}

/** Resolves the current application constants and prompts.
 * @example const resolver: ApplicationContextResolver = createApplicationContextResolver({ env: {} });
 */
export interface ApplicationContextResolver {
  /** Resolves values in Effect with a replaceable constant runner.
   * @param options - Logger and cancellation signal.
   * @returns Resolved values or ContextResolutionFailure; requires AppConstantRunner.
   * @example Effect.runPromise(resolver.resolveEffect(context).pipe(Effect.provide(AppConstantRunnerLive)));
   */
  readonly resolveEffect: (
    options: ApplicationResolveOptions,
  ) => Effect.Effect<ResolvedApplicationContext, ContextResolutionFailure, AppConstantRunner>;
  /** Promise compatibility adapter for application handlers.
   * @param options - Logger and cancellation signal.
   * @returns Resolved values or a rejection with the original resolver error.
   * @example await resolver.resolve({ signal, log });
   */
  readonly resolve: (options: ApplicationResolveOptions) => Promise<ResolvedApplicationContext>;
}
