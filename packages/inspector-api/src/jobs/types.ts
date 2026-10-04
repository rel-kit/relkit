export type {
  InspectorJobsOperation,
  InspectorJobsOperationContext,
  InspectorJobsCapabilities,
  InspectorScheduleOperations,
  InspectorJobsBinding,
  InspectorJobsPrivilegeRequest,
  InspectorJobsServices,
} from "./jobs.types.js";
import { Schema } from "effect";
import type { JobRunStatus } from "@relkit/contracts/jobs";

/** Native jobs validation/availability failure retaining the existing positional constructor. */
export class InspectorJobsError extends Schema.TaggedError<InspectorJobsError>()(
  "InspectorJobsError",
  {
    code: Schema.Literals([
      "RELKIT_INSPECTOR_JOBS_UNAVAILABLE",
      "RELKIT_INSPECTOR_JOBS_FORBIDDEN",
      "RELKIT_INSPECTOR_JOBS_NOT_FOUND",
      "RELKIT_INSPECTOR_JOBS_FILTER_INVALID",
      "RELKIT_INSPECTOR_JOBS_FILTER_UNSUPPORTED",
      "RELKIT_INSPECTOR_JOBS_CURSOR_INVALID",
      "RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED",
      "RELKIT_INSPECTOR_JOBS_OPERATION_INVALID",
    ]),
    status: Schema.Literals([400, 403, 404, 409, 501, 503]),
    message: Schema.String,
  },
) {
  constructor(
    code:
      | "RELKIT_INSPECTOR_JOBS_UNAVAILABLE"
      | "RELKIT_INSPECTOR_JOBS_FORBIDDEN"
      | "RELKIT_INSPECTOR_JOBS_NOT_FOUND"
      | "RELKIT_INSPECTOR_JOBS_FILTER_INVALID"
      | "RELKIT_INSPECTOR_JOBS_FILTER_UNSUPPORTED"
      | "RELKIT_INSPECTOR_JOBS_CURSOR_INVALID"
      | "RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED"
      | "RELKIT_INSPECTOR_JOBS_OPERATION_INVALID",
    status: 400 | 403 | 404 | 409 | 501 | 503,
    message: string = code,
  ) {
    super({ code, status, message });
    this.name = "InspectorJobsError";
  }
}

export const TERMINAL_RUN_STATES: readonly JobRunStatus[] = [
  "completed",
  "failed",
  "cancelled",
  "timed-out",
];
