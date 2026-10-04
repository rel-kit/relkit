import type { InspectorGuard } from "./routes.types.js";
import { runInspectorPromise as runExecutionPromise } from "../native-edge.js";
import { inspectorNativeJobsExecution } from "./native.service.js";
import { API_BASE_PATH } from "@relkit/contracts";
import type { Hono } from "hono";
import { controlJobRunEffect as controlJobRun } from "./controls.js";
import {
  getJobDefinitionEffect as getJobDefinition,
  getTaskDefinitionEffect as getTaskDefinition,
  listJobDefinitionsEffect as listJobDefinitions,
} from "./definitions.js";
import { listJobRunsEffect as listJobRuns, getJobRunEffect as getJobRun } from "./runs.js";
import {
  listJobServicesEffect as listJobServices,
  getJobServiceEffect as getJobService,
} from "./service-list.js";
import {
  getScheduleEffect as getSchedule,
  listSchedulesEffect as listSchedules,
  scheduleActionEffect as scheduleAction,
} from "./schedules.js";
import { authorizeJobs } from "./services.js";
import { json, required, requiredParam } from "../router-utils.js";

/** Established native jobs query and administration route paths. */
export const JOBS_ENDPOINT_PATHS = Object.freeze([
  `${API_BASE_PATH}/jobs/definitions`,
  `${API_BASE_PATH}/jobs/definitions/:id`,
  `${API_BASE_PATH}/jobs/tasks/:id`,
  `${API_BASE_PATH}/jobs/runs`,
  `${API_BASE_PATH}/jobs/runs/:id`,
  `${API_BASE_PATH}/jobs/runs/:id/cancel`,
  `${API_BASE_PATH}/jobs/runs/:id/retry`,
  `${API_BASE_PATH}/jobs/schedules`,
  `${API_BASE_PATH}/jobs/schedules/:id`,
  `${API_BASE_PATH}/jobs/schedules/:id/pause`,
  `${API_BASE_PATH}/jobs/schedules/:id/resume`,
  `${API_BASE_PATH}/jobs/services`,
  `${API_BASE_PATH}/jobs/services/:id`,
] as const);

/**
 * Registers thin native jobs edges backed by the reused Inspector owner.
 * @param app - Hono router receiving the synchronous route registrations.
 * @param guard - Native ingress wrapper enforcing authorization before generation access.
 * @param owner - Reused service runtime supplied by the installing router.
 * @returns No value; routes retain existing paths and public status contracts.
 */
export function installJobsEndpoints(
  app: Hono,
  guard: InspectorGuard,
  owner = inspectorNativeJobsExecution,
): void {
  const base = `${API_BASE_PATH}/jobs`;
  app.get(
    `${base}/definitions`,
    guard(async (context, generation) => {
      const active = required(generation);
      await authorizeJobs(active, context.req.raw, "read");
      return json(
        await runExecutionPromise(owner, listJobDefinitions(active, context.req.raw, active.jobs)),
      );
    }),
  );
  app.get(
    `${base}/definitions/:id`,
    guard(async (context, generation) => {
      const active = required(generation);
      await authorizeJobs(active, context.req.raw, "read");
      return json(
        await runExecutionPromise(
          owner,
          getJobDefinition(active, requiredParam(context, "id"), active.jobs),
        ),
      );
    }),
  );
  app.get(
    `${base}/tasks/:id`,
    guard(async (context, generation) => {
      const active = required(generation);
      await authorizeJobs(active, context.req.raw, "read");
      return json(
        await runExecutionPromise(owner, getTaskDefinition(active, requiredParam(context, "id"))),
      );
    }),
  );
  app.get(
    `${base}/runs`,
    guard(async (context, generation) =>
      json(await runExecutionPromise(owner, listJobRuns(required(generation), context.req.raw))),
    ),
  );
  app.get(
    `${base}/runs/:id`,
    guard(async (context, generation) =>
      json(
        await runExecutionPromise(
          owner,
          getJobRun(required(generation), context.req.raw, requiredParam(context, "id")),
        ),
      ),
    ),
  );
  app.post(
    `${base}/runs/:id/cancel`,
    guard(async (context, generation) =>
      json(
        await runExecutionPromise(
          owner,
          controlJobRun(
            required(generation),
            context.req.raw,
            requiredParam(context, "id"),
            "cancel",
          ),
        ),
      ),
    ),
  );
  app.post(
    `${base}/runs/:id/retry`,
    guard(async (context, generation) =>
      json(
        await runExecutionPromise(
          owner,
          controlJobRun(
            required(generation),
            context.req.raw,
            requiredParam(context, "id"),
            "retry",
          ),
        ),
      ),
    ),
  );
  app.get(
    `${base}/schedules`,
    guard(async (context, generation) =>
      json(await runExecutionPromise(owner, listSchedules(required(generation), context.req.raw))),
    ),
  );
  app.get(
    `${base}/schedules/:id`,
    guard(async (context, generation) =>
      json(
        await runExecutionPromise(
          owner,
          getSchedule(required(generation), context.req.raw, requiredParam(context, "id")),
        ),
      ),
    ),
  );
  app.post(
    `${base}/schedules`,
    guard(async (context, generation) =>
      json(
        await runExecutionPromise(
          owner,
          scheduleAction(required(generation), context.req.raw, "upsert"),
        ),
      ),
    ),
  );
  app.post(
    `${base}/schedules/:id/pause`,
    guard(async (context, generation) =>
      json(
        await runExecutionPromise(
          owner,
          scheduleAction(
            required(generation),
            context.req.raw,
            "pause",
            requiredParam(context, "id"),
          ),
        ),
      ),
    ),
  );
  app.post(
    `${base}/schedules/:id/resume`,
    guard(async (context, generation) =>
      json(
        await runExecutionPromise(
          owner,
          scheduleAction(
            required(generation),
            context.req.raw,
            "resume",
            requiredParam(context, "id"),
          ),
        ),
      ),
    ),
  );
  app.delete(
    `${base}/schedules/:id`,
    guard(async (context, generation) =>
      json(
        await runExecutionPromise(
          owner,
          scheduleAction(
            required(generation),
            context.req.raw,
            "delete",
            requiredParam(context, "id"),
          ),
        ),
      ),
    ),
  );
  app.get(
    `${base}/services`,
    guard(async (context, generation) =>
      json(
        await runExecutionPromise(owner, listJobServices(required(generation), context.req.raw)),
      ),
    ),
  );
  app.get(
    `${base}/services/:id`,
    guard(async (context, generation) =>
      json(
        await runExecutionPromise(
          owner,
          getJobService(required(generation), context.req.raw, requiredParam(context, "id")),
        ),
      ),
    ),
  );
}
