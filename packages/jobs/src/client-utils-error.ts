import { Schema } from "effect";

/** Expected client helper failure with its original compatibility error.
 * @example if (error instanceof ClientUtilityFailure) console.log(error.message);
 */
export class ClientUtilityFailure extends Schema.TaggedError<ClientUtilityFailure>()(
  "Jobs.ClientUtilityFailure",
  { cause: Schema.Defect() },
) {}
