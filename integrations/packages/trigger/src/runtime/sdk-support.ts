import type { NativeSubmission } from "@relkit/jobs/adapter";

export function triggerTaskIdentifier(request: Pick<NativeSubmission, "jobId" | "taskId" | "taskVersion" | "buildId">): string {
  return ["relkit", request.jobId, request.taskId, request.taskVersion, request.buildId]
    .map((value) => String(value).replace(/[^a-zA-Z0-9_.-]/gu, "-"))
    .join("-");
}
