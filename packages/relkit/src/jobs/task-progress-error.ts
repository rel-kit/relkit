import { Schema } from "effect";
import type { TaskEmissionErrorCode } from "./task-progress.types.js";
/** Compatibility error thrown by Promise based task emitters.
 * @example if (error instanceof TaskEmissionError) console.log(error.message);
 */
export class TaskEmissionError extends TypeError {
  constructor(
    readonly code: TaskEmissionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TaskEmissionError";
  }
}
/** Expected emission failure in Effect, retaining the compatibility error.
 * @example if (error instanceof TaskEmissionFailure) console.log(error.message);
 */
export class TaskEmissionFailure extends Schema.TaggedError<TaskEmissionFailure>()(
  "Jobs.TaskEmissionFailure",
  { code: Schema.String, cause: Schema.Defect() },
) {}
