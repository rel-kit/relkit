import { Data } from "effect";

/** Expected invalid config declaration or value with a stable failure tag.
 * @example new ConfigValidationError({ message: "Expected a finite number" });
 */
export class ConfigValidationError extends Data.TaggedError("ConfigValidationError")<{
  readonly message: string;
  readonly syntax?: boolean;
}> {}
