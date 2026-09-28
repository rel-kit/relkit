import { Schema } from "effect";

/** Tagged native agent continuation or state failure. */
export class NativeAgentInterruptionFailure extends Schema.TaggedError<NativeAgentInterruptionFailure>()(
  "NativeAgentInterruptionFailure",
  { message: Schema.String, cause: Schema.Unknown },
) {}

/** Wraps a native continuation failure for Effect callers.
 * @param cause - Invalid reply or native state provider failure.
 * @returns A tagged native agent interruption failure.
 * @example nativeAgentInterruptionFailure(new TypeError("invalid reply"));
 */
export function nativeAgentInterruptionFailure(cause: unknown): NativeAgentInterruptionFailure {
  return new NativeAgentInterruptionFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
