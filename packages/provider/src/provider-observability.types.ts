import type { Effect } from "effect";
import type {
  ProviderBindingResolutionFailure,
  ProviderFeatureMismatchFailure,
  ProviderProfileSelectionFailure,
  ProviderValidationError,
} from "./provider-errors.js";
/** Fixed names for provider operations; never derived from user input. */
export type ProviderOperation =
  | "binding-value.create"
  | "binding-value.is-ref"
  | "binding.resolve"
  | "binding.normalize"
  | "profile.normalize"
  | "profile.select"
  | "source.local"
  | "source.infrastructure"
  | "source.normalize"
  | "capability.define"
  | "feature.define"
  | "connection.define"
  | "behavior.define"
  | "access.define"
  | "integration.define"
  | "recipe.define"
  | "adapter.define";
/** Expected tagged failures from provider operations. */
export type ProviderError =
  | ProviderValidationError
  | ProviderProfileSelectionFailure
  | ProviderFeatureMismatchFailure
  | ProviderBindingResolutionFailure;
/** Substitutable operation telemetry used by public Effect functions. */
export interface ProviderTelemetryService {
  /** Observe an operation without changing its result or failure.
   * @param operation - Fixed operation name.
   * @param effect - Effect to observe.
   * @returns The same success and error channels.
   * @example telemetry.observe("capability.define", Effect.succeed("cache"));
   */
  readonly observe: <A, E, R>(
    operation: ProviderOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
