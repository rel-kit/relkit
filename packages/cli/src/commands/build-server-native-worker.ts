export const SERVER_NATIVE_WORKER_SOURCE = `
function registerNativeJobWorker(runtime, jobs, tasks, executor) {
  const register = runtime.adapter.registerWorker;
  if (typeof register !== "function") return;
  const profiles = new Set((plan.jobs ?? []).map((candidate) => candidate.profile));
  const first = jobs[0];
  if (first === undefined) return;
  const definitions = jobs.map((job) => nativeTaskDefinition(job, tasks));
  const role = process.env.RELKIT_WORKER_ROLE ?? "worker";
  const handle = register({
    definitions,
    executor,
    startWorker: role !== "api",
    ...(profiles.size === 1 ? {} : { servePath: "/api/inngest/" + safeSegment(first.profile) }),
  });
  if (handle === null || typeof handle !== "object" || typeof handle.ready !== "function" || typeof handle.close !== "function") {
    throw new Error("Native jobs adapter returned an invalid worker handle.");
  }
  const registration = { handle, runtime, jobs, definitions, startWorker: role !== "api" };
  nativeJobWorkerRegistrations.add(registration);
  nativeJobWorkerHandles.add(handle);
  nativeJobWorkerReady = false;
  nativeJobWorkerReadyHandles.delete(handle);
  if (typeof handle.path === "string" || typeof handle.handler === "function") {
    if (typeof handle.path !== "string" || typeof handle.handler !== "function") throw new Error("Native jobs adapter returned an incomplete worker endpoint.");
    nativeJobWorkerEndpoints.set(handle.path, handle);
  }
  if (nativeJobWorkerServerReady) void readyNativeJobWorker(registration);
  return handle;
}

function nativeTaskDefinition(job, tasks) {
  const jobId = String(job.jobId ?? job.id);
  const taskId = String(job.taskId);
  const taskVersion = String(job.taskVersion);
  const manifestJob = nativeJobsManifest?.jobs?.find((candidate) => candidate.id === job.id || candidate.id === jobId);
  const buildId = String(job.buildId ?? manifestJob?.buildId ?? generationId);
  const task = tasks[taskId];
  const functionId = ["relkit", jobId, taskId, taskVersion, buildId].map(safeSegment).join("-");
  const schedules = scheduleDefinitions(job);
  return {
    id: functionId,
    functionId,
    eventName: ["relkit", jobId, taskId, taskVersion, buildId].map(safeSegment).join("/"),
    jobId,
    taskId,
    version: taskVersion,
    taskVersion,
    buildId,
    ...(schedules === undefined ? {} : { schedules }),
    ...(task?.policy === undefined ? {} : { policy: task.policy }),
    ...(task?.resources === undefined ? {} : { resources: task.resources }),
  };
}

function scheduleDefinitions(job) {
  const value = job.schedules ?? job.schedule;
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]/gu, "-");
}

function nativeJobHandler(request) {
  const endpoint = nativeJobWorkerEndpoints.get(new URL(request.url).pathname);
  return endpoint === undefined ? undefined : endpoint.handler(request);
}

async function readyNativeJobWorker(registration) {
  let retryDelay = 250;
  let lastError;
  while (!stopping) {
    try {
      await registration.handle.ready();
      if (registration.startWorker && registration.runtime.adapter.schedules !== undefined) {
        for (const definition of registration.definitions) {
          const desired = definition.schedules ?? [];
          await reconcileNativeSchedules({
            native: registration.runtime.adapter.schedules,
            desired,
            context: registration.runtime.operationContext({ signal: shutdownController.signal }),
            jobId: definition.jobId,
            taskId: definition.taskId,
            taskVersion: definition.taskVersion,
            buildId: definition.buildId,
          });
        }
      }
      nativeJobWorkerReadyHandles.add(registration.handle);
      nativeJobWorkerReady = nativeJobWorkerReadyHandles.size === nativeJobWorkerRegistrations.size;
      return true;
    } catch (error) {
      lastError = error;
      nativeJobWorkerReadyHandles.delete(registration.handle);
      nativeJobWorkerReady = false;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(retryDelay * 2, 5_000);
    }
  }
  if (lastError !== undefined)
    recordRuntimeFailure("runtime.native-job-registration", "Native jobs worker registration failed", lastError, "job");
  return false;
}

async function readyNativeJobWorkers() {
  const results = await Promise.all([...nativeJobWorkerRegistrations].map((registration) => readyNativeJobWorker(registration)));
  nativeJobWorkerReady = results.length === nativeJobWorkerRegistrations.size && results.every(Boolean);
}
`;
