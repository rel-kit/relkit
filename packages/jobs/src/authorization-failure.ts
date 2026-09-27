import { Schema } from "effect";

/** A denied or malformed jobs authorization decision.
 * @example new JobAuthorizationFailure({ reason: "scope" });
 */
export class JobAuthorizationFailure extends Schema.TaggedError<JobAuthorizationFailure>()(
  "Jobs.AuthorizationFailure",
  { reason: Schema.String },
) {}
