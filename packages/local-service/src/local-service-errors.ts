import { Schema } from "effect";
import type { LocalServiceVersionErrorCode } from "./protocol.types.js";

/** Expected validation failure in a local-service Effect operation.
 * @example Effect.catchTag("LocalServiceValidationFailure", ({ message }) => Effect.logWarning(message));
 */
export class LocalServiceValidationFailure extends Schema.TaggedError<LocalServiceValidationFailure>()(
  "LocalServiceValidationFailure",
  { message: Schema.String },
) {}

/** Expected unsupported artifact version in a local-service Effect operation.
 * @example Effect.catchTag("LocalServiceVersionFailure", ({ code }) => Effect.logWarning(code));
 */
export class LocalServiceVersionFailure extends Schema.TaggedError<LocalServiceVersionFailure>()(
  "LocalServiceVersionFailure",
  {
    code: Schema.Literals([
      "RELKIT_LOCAL_SERVICE_PLAN_VERSION_UNSUPPORTED",
      "RELKIT_LOCAL_SERVICE_STATE_VERSION_UNSUPPORTED",
      "RELKIT_PROVIDER_OVERRIDE_STATE_VERSION_UNSUPPORTED",
    ]),
    label: Schema.String,
    version: Schema.Unknown,
    expected: Schema.Number,
    command: Schema.String,
  },
) {}

/** Legacy synchronous error for a stale local-service artifact.
 * @example throw new LocalServiceVersionError("RELKIT_LOCAL_SERVICE_PLAN_VERSION_UNSUPPORTED", "Local-service plan", 0, 1, "relkit check");
 */
export class LocalServiceVersionError extends TypeError {
  /** Construct an error with regeneration guidance.
   * @param code - Stable artifact error code.
   * @param label - Artifact label.
   * @param version - Unsupported version.
   * @param expected - Supported version.
   * @param command - Regeneration command.
   * @returns A named version error.
   * @example new LocalServiceVersionError("RELKIT_LOCAL_SERVICE_PLAN_VERSION_UNSUPPORTED", "Local-service plan", 0, 1, "relkit check");
   */
  constructor(
    readonly code: LocalServiceVersionErrorCode,
    label: string,
    version: unknown,
    expected: number,
    command: string,
  ) {
    super(
      `${label} version ${String(version)} is unsupported; expected ${expected}. Regenerate with \`${command}\`.`,
    );
    this.name = "LocalServiceVersionError";
  }
}
