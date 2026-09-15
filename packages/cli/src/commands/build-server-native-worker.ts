export const SERVER_NATIVE_WORKER_SOURCE = `
function registerNativeJobWorker(runtime, jobs, tasks, executor) {
  const register = runtime.adapter.registerWorker;
  if (typeof register !== "function") return;
  const profiles = new Set((plan.jobs ?? []).map((candidate) => candidate.profile));
  const first = jobs[0];
  if (first === undefined) return;
  const endpoint = register({
    definitions: jobs.map((job) => nativeTaskDefinition(job, tasks)),
    executor,
    ...(profiles.size === 1 ? {} : { servePath: "/api/inngest/" + safeSegment(first.profile) }),
  });
  if (endpoint === null || typeof endpoint !== "object" || typeof endpoint.path !== "string" || typeof endpoint.handler !== "function") {
    throw new Error("Native jobs adapter returned an invalid worker endpoint.");
  }
  nativeJobWorkerReady = false;
  nativeJobWorkerReadyEndpoints.delete(endpoint);
  nativeJobWorkerEndpoints.set(endpoint.path, endpoint);
  if (nativeJobWorkerServerReady) void readyNativeJobWorker(endpoint);
}

function nativeTaskDefinition(job, tasks) {
  const jobId = String(job.jobId ?? job.id);
  const taskId = String(job.taskId);
  const taskVersion = String(job.taskVersion);
  const manifestJob = nativeJobsManifest?.jobs?.find((candidate) => candidate.id === job.id || candidate.id === jobId);
  const buildId = String(job.buildId ?? manifestJob?.buildId ?? generationId);
  const task = tasks[taskId];
  return {
    functionId: ["relkit", jobId, taskId, taskVersion, buildId].map(safeSegment).join("-"),
    eventName: ["relkit", jobId, taskId, taskVersion, buildId].map(safeSegment).join("/"),
    ...(job.policy === undefined && task?.policy === undefined ? {} : { policy: job.policy ?? task.policy }),
  };
}

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]/gu, "-");
}

function nativeJobHandler(request) {
  const endpoint = nativeJobWorkerEndpoints.get(new URL(request.url).pathname);
  return endpoint === undefined ? undefined : endpoint.handler(request);
}

async function readyNativeJobWorker(endpoint) {
  try {
    await endpoint.ready();
    nativeJobWorkerReadyEndpoints.add(endpoint);
    nativeJobWorkerReady = nativeJobWorkerReadyEndpoints.size === nativeJobWorkerEndpoints.size;
    return true;
  } catch (error) {
    nativeJobWorkerReadyEndpoints.delete(endpoint);
    nativeJobWorkerReady = false;
    recordRuntimeFailure("runtime.native-job-registration", "Native jobs worker registration failed", error, "job");
    return false;
  }
}

async function readyNativeJobWorkers() {
  const results = await Promise.all([...nativeJobWorkerEndpoints.values()].map((endpoint) => readyNativeJobWorker(endpoint)));
  nativeJobWorkerReady = results.length === nativeJobWorkerEndpoints.size && results.every(Boolean);
}
`;
