import { API_BASE_PATH } from "@relkit/contracts";
import type { Context, Hono } from "hono";
import { controlJobRun } from "./controls.js";
import { getJobDefinition, getTaskDefinition, listJobDefinitions } from "./definitions.js";
import { listJobRuns, getJobRun } from "./runs.js";
import { listJobServices, getJobService } from "./service-list.js";
import { getSchedule, listSchedules, scheduleAction } from "./schedules.js";
import { authorizeJobs } from "./services.js";
import { json, required, requiredParam } from "../router-utils.js";
import type { ResolvedActiveGeneration } from "../shared.js";

export const JOBS_ENDPOINT_PATHS = Object.freeze([
  `${API_BASE_PATH}/jobs/definitions`, `${API_BASE_PATH}/jobs/definitions/:id`,
  `${API_BASE_PATH}/jobs/tasks/:id`, `${API_BASE_PATH}/jobs/runs`, `${API_BASE_PATH}/jobs/runs/:id`,
  `${API_BASE_PATH}/jobs/runs/:id/cancel`, `${API_BASE_PATH}/jobs/runs/:id/retry`,
  `${API_BASE_PATH}/jobs/schedules`, `${API_BASE_PATH}/jobs/schedules/:id`,
  `${API_BASE_PATH}/jobs/schedules/:id/pause`, `${API_BASE_PATH}/jobs/schedules/:id/resume`,
  `${API_BASE_PATH}/jobs/services`, `${API_BASE_PATH}/jobs/services/:id`,
] as const);

type InspectorGuard = (
  handler: (context: Context, generation?: ResolvedActiveGeneration) => Promise<Response>,
) => (context: Context) => Promise<Response>;

export function installJobsEndpoints(app: Hono, guard: InspectorGuard): void {
  const base = `${API_BASE_PATH}/jobs`;
  app.get(`${base}/definitions`, guard(async (context, generation) => { const active = required(generation); await authorizeJobs(active, context.req.raw, "read"); return json(await listJobDefinitions(active, context.req.raw, active.jobs)); }));
  app.get(`${base}/definitions/:id`, guard(async (context, generation) => { const active = required(generation); await authorizeJobs(active, context.req.raw, "read"); return json(await getJobDefinition(active, requiredParam(context, "id"), active.jobs)); }));
  app.get(`${base}/tasks/:id`, guard(async (context, generation) => { const active = required(generation); await authorizeJobs(active, context.req.raw, "read"); return json(getTaskDefinition(active, requiredParam(context, "id"))); }));
  app.get(`${base}/runs`, guard(async (context, generation) => json(await listJobRuns(required(generation), context.req.raw))));
  app.get(`${base}/runs/:id`, guard(async (context, generation) => json(await getJobRun(required(generation), context.req.raw, requiredParam(context, "id")))));
  app.post(`${base}/runs/:id/cancel`, guard(async (context, generation) => json(await controlJobRun(required(generation), context.req.raw, requiredParam(context, "id"), "cancel"))));
  app.post(`${base}/runs/:id/retry`, guard(async (context, generation) => json(await controlJobRun(required(generation), context.req.raw, requiredParam(context, "id"), "retry"))));
  app.get(`${base}/schedules`, guard(async (context, generation) => json(await listSchedules(required(generation), context.req.raw))));
  app.get(`${base}/schedules/:id`, guard(async (context, generation) => json(await getSchedule(required(generation), context.req.raw, requiredParam(context, "id")))));
  app.post(`${base}/schedules`, guard(async (context, generation) => json(await scheduleAction(required(generation), context.req.raw, "upsert"))));
  app.post(`${base}/schedules/:id/pause`, guard(async (context, generation) => json(await scheduleAction(required(generation), context.req.raw, "pause", requiredParam(context, "id")))));
  app.post(`${base}/schedules/:id/resume`, guard(async (context, generation) => json(await scheduleAction(required(generation), context.req.raw, "resume", requiredParam(context, "id")))));
  app.delete(`${base}/schedules/:id`, guard(async (context, generation) => json(await scheduleAction(required(generation), context.req.raw, "delete", requiredParam(context, "id")))));
  app.get(`${base}/services`, guard(async (context, generation) => json(await listJobServices(required(generation), context.req.raw))));
  app.get(`${base}/services/:id`, guard(async (context, generation) => json(await getJobService(required(generation), context.req.raw, requiredParam(context, "id")))));
}
