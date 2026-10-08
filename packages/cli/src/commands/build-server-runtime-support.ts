import { GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@relkit/contracts";

/** Pure lookup, health, and structured log adapters for the generated runtime host. */
export const SERVER_RUNTIME_SUPPORT_SOURCE = `
function provider(providerRegistry, capability, profile) {
  return providerRegistry.resolve(capability, profile).value;
}
async function resourceRuntimeMetadata(capability, nodes) {
  const providerRegistry = await providerStartup;
  if (providerRegistry === undefined) return [];
  return nodes.map((node) => {
    const handle = providerRegistry.resolve(capability, node.profile);
    const features = handle.binding.adapter.features ?? [];
    const capabilities = Object.fromEntries(features.map((feature) => [feature, true]));
    for (const name of ["signedReadUrl", "signedWriteUrl", "increment"]) {
      const supported = handle.value?.capabilities?.[name];
      if (typeof supported === "boolean") capabilities[name] = supported;
    }
    return { id: node.id, profile: node.profile, capabilities };
  });
}
async function queryEventRuntime(query) {
  const providerRegistry = await providerStartup;
  const result = { events: [], triggers: [], capabilities: [], publications: [], deliveries: [] };
  if (providerRegistry === undefined) return result;
  const profiles = [...new Set((plan.events ?? []).map((node) => node.profile))].sort();
  let start = 0, cursor;
  if (query.cursor !== undefined) {
    const separator = query.cursor.indexOf("|");
    const index = query.cursor.slice(0, separator);
    if (separator < 1 || !/^\\d+$/.test(index) || Number(index) >= profiles.length)
      throw new InspectorQueryError("Event cursor is invalid");
    start = Number(index);
    cursor = query.cursor.slice(separator + 1) || undefined;
  }
  const limit = query.limit ?? 50;
  for (let index = start; index < profiles.length; index++) {
    const value = provider(providerRegistry, "event", profiles[index]);
    if (typeof value?.query !== "function") continue;
    const page = await value.query({ ...query, cursor: index === start ? cursor : undefined,
      limit: limit - result.deliveries.length });
    for (const field of Object.keys(result)) result[field].push(...(page[field] ?? []));
    if (page.nextCursor !== undefined || result.deliveries.length >= limit) {
      const next = page.nextCursor !== undefined ? index : index + 1;
      if (next < profiles.length) result.nextCursor = String(next) + "|" + (page.nextCursor ?? "");
      break;
    }
  }
  return result;
}
async function supportsInspector(capability, nodes, id, ...operations) {
  try {
    const inspector = await resourceInspector(capability, nodes, id);
    return operations.every((operation) => typeof inspector[operation] === "function");
  } catch {
    return false;
  }
}
async function resourceInspector(capability, nodes, id) {
  const node = nodes.find((candidate) => candidate.id === id);
  if (node === undefined) throw new Error(\`Resource "\${id}" is unavailable.\`);
  const providerRegistry = await providerStartup;
  if (providerRegistry === undefined) throw new Error("Provider registry unavailable.");
  const value = provider(providerRegistry, capability, node.profile);
  if (value === null || typeof value !== "object" || value.inspector === undefined)
    throw new Error(\`Resource "\${id}" does not support inspector access.\`);
  return value.inspector;
}
async function resolveRateLimitStore(storeId) {
  const cache = plan.caches.find((node) => node.id === storeId);
  if (cache === undefined) throw new Error(\`Rate-limit cache "\${storeId}" is unavailable.\`);
  const providerRegistry = await providerStartup;
  if (providerRegistry === undefined) throw new Error("Provider registry unavailable.");
  return provider(providerRegistry, "cache", cache.profile);
}
function queueProvider(providerRegistry, context) {
  const value = provider(providerRegistry, "job", context.profile);
  if (value === null || typeof value !== "object" || typeof value.createQueue !== "function")
    throw new Error(\`Job provider profile "\${context.profile}" cannot materialize queues.\`);
  return value.createQueue(context);
}
async function startJobWorker(jobs) {
  await runtimeOwner.worker("job-worker", async () => {
      await jobs.tick(new Date());
      await runtimeOwner.each([...jobs.jobs.keys()], (jobId) => jobs.runNext(jobId));
  });
}
function errorCode(error) {
  if (error !== null && typeof error === "object" && typeof error.code === "string") return error.code;
  if (error !== null && typeof error === "object" && error.name === "EnvResolutionError") return "RELKIT_ENVIRONMENT_INVALID";
  return error instanceof Error ? error.name : "unknown";
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function recordRuntimeFailure(component, message, error, source) {
  const record = telemetry.collect({
    version: 2,
    signal: "log",
    timestamp: new Date().toISOString(),
    level: "error",
    component,
    message,
    fields: { code: errorCode(error), detail: errorMessage(error), ...(environment !== "production" && process.env.RELKIT_DEV_LOGS === "1" ? { error: redactFailureDetail(error, undefined, 0, true) } : {}) },
    generationId,
    graphHash,
    source,
  });
  writeRuntimeLog(record);
}
function writeRuntimeLog(record) {
  if (record?.signal !== "log") return;
  if (environment === "production") stdoutJsonSink.write(record);
  else if (process.env.RELKIT_DEV_LOGS === "1") process.stdout.write("\\u001e" + JSON.stringify(record) + "\\n");
  else consoleHumanSink.write(formatHumanLog(record), record);
}
function healthResponse(status, code = 200) {
  return Response.json({ protocol: "relkit.inspector", version: 1, status, graphHash, activationFingerprint, manifestGraphHash: runtimeManifest.graphHash, graphContractVersion: ${GRAPH_VERSION}, manifestContractVersion: ${MANIFEST_VERSION}, manifestGeneratorVersion: ${GENERATOR_VERSION}, environmentReady: true, providerReady: runtimeState().ready.provider && runtimeState().ready.nativeWorker && !runtimeState().stopping, databaseReady: runtimeState().ready.database && !runtimeState().stopping, authReady: runtimeState().ready.auth && !runtimeState().stopping, ...(sourceToken === undefined ? {} : { sourceToken }), ...(generationToken === undefined ? {} : { generationToken }) }, { status: code, headers: { "x-relkit-api-version": "1" } });
}
function resolveRuntimeEnvironment(definition, environment, source) {
  try {
    const resolved = resolveEnv(definition, { environment, source });
    const values = { ...source };
    for (const [name, value] of Object.entries(resolved)) {
      if (source[name] !== undefined || value === undefined) continue;
      values[name] = runtimeEnvironmentValue(value);
    }
    return { values, error: undefined };
  } catch (error) {
    return { values: source, error };
  }
}
function runtimeEnvironmentValue(value) {
  return value;
}
`;
