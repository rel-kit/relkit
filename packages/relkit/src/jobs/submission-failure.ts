import { Schema } from "effect";
/** Expected failure at the jobs submission pipeline boundary.
 * @example if (error instanceof JobSubmissionPipelineFailure) console.log(error.message);
 */
export class JobSubmissionPipelineFailure extends Schema.TaggedError<JobSubmissionPipelineFailure>()(
  "Jobs.SubmissionPipelineFailure",
  { cause: Schema.Defect() },
) {}
