import { Data } from "effect";
import type {
  ProviderBindingResolutionCode,
  ProviderValidationCode,
} from "./provider-errors.types.js";
export type {
  ProviderBindingResolutionCode,
  ProviderValidationCode,
} from "./provider-errors.types.js";
/** Tagged invalid provider input, with a stable category and safe message.
 * @example Effect.catchTag("ProviderValidationError", (error) => Effect.logWarning(error.message));
 */
export class ProviderValidationError extends Data.TaggedError("ProviderValidationError")<{
  readonly code: ProviderValidationCode;
  readonly message: string;
}> {}
/** Tagged profile failure in the Effect error channel.
 * @example Effect.catchTag("ProviderProfileSelectionError", (error) => Effect.logWarning(error.message));
 */
export class ProviderProfileSelectionFailure extends Data.TaggedError(
  "ProviderProfileSelectionError",
)<{
  readonly code: "AMBIGUOUS_PROVIDER_PROFILE" | "UNKNOWN_PROVIDER_PROFILE";
  readonly capability: string;
  readonly descriptorId: string;
  readonly profiles: readonly string[];
  readonly reason: string;
  readonly message: string;
}> {}
/** Tagged missing-feature failure in the Effect error channel.
 * @example Effect.catchTag("ProviderFeatureMismatchError", (error) => Effect.logWarning(error.message));
 */
export class ProviderFeatureMismatchFailure extends Data.TaggedError(
  "ProviderFeatureMismatchError",
)<{
  readonly code: "MISSING_PROVIDER_FEATURE";
  readonly capability: string;
  readonly profile: string;
  readonly descriptorId: string;
  readonly features: readonly string[];
  readonly message: string;
}> {}
/** Tagged connection failure in the Effect error channel.
 * @example Effect.catchTag("ProviderBindingResolutionError", (error) => Effect.logWarning(error.message));
 */
export class ProviderBindingResolutionFailure extends Data.TaggedError(
  "ProviderBindingResolutionError",
)<{
  readonly code: ProviderBindingResolutionCode;
  readonly bindingId: string;
  readonly field: string;
  readonly reason: string;
  readonly message: string;
}> {}
