import { GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "relkit/contracts";

/** Pure lookup, health, and structured log adapters for the generated runtime host. */
export const SERVER_RUNTIME_SUPPORT_SOURCE = `
function provider(providerRegistry, capability, profile) {
  return providerRegistry.resolve(capability, profile).value;
}
// Provider state from the readiness the runtime owner tracks: ready, degraded while not (or no
// longer) ready, unavailable when the provider registry or this resource's provider failed.
async function resourceRuntimeMetadata(capability, nodes) {
  const providerRegistry = await providerStartup;
  if (providerRegistry === undefined) return nodes.map((node) => ({ id: node.id, profile: node.profile, state: "unavailable" }));
  const state = runtimeState().ready.provider && !runtimeState().stopping ? "ready" : "degraded";
  return nodes.map((node) => {
    let handle;
    try {
      handle = providerRegistry.resolve(capability, node.profile);
    } catch {
      return { id: node.id, profile: node.profile, state: "unavailable" };
    }
    const features = handle.binding.adapter.features ?? [];
    const capabilities = Object.fromEntries(features.map((feature) => [feature, true]));
    for (const name of ["signedReadUrl", "signedWriteUrl", "increment"]) {
      const supported = handle.value?.capabilities?.[name];
      if (typeof supported === "boolean") capabilities[name] = supported;
    }
    return { id: node.id, profile: node.profile, state, capabilities };
  });
}
// Distinct dynamic calls of this generation (one entry per relationship, caller and callee, with
// a count and the last time seen), for the Inspector; production keeps none.
const observedEdges = new Map();
function recordObservedEdge(edge) {
  if (environment === "production" || edge === null || typeof edge !== "object") return;
  const relationship = edge.relationship ?? edge.kind;
  if (typeof relationship !== "string" || typeof edge.from !== "string" || typeof edge.to !== "string") return;
  const key = JSON.stringify([relationship, edge.from, edge.to]);
  const seenAt = new Date().toISOString();
  const current = observedEdges.get(key);
  if (current !== undefined) {
    current.count += 1;
    current.lastSeenAt = seenAt;
  } else if (observedEdges.size < 1024) {
    observedEdges.set(key, { relationship, from: edge.from, to: edge.to, count: 1, firstSeenAt: seenAt, lastSeenAt: seenAt });
  }
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
  // Total and per-state counts cover every profile, whichever page this is.
  const totals = new Map();
  for (let index = start; index < profiles.length; index++) {
    const value = provider(providerRegistry, "event", profiles[index]);
    if (typeof value?.query !== "function") continue;
    const page = await value.query({ ...query, cursor: index === start ? cursor : undefined,
      limit: limit - result.deliveries.length });
    if (index === start && cursor !== undefined) totals.set(index, undefined);
    else totals.set(index, page);
    for (const field of Object.keys(result)) result[field].push(...(page[field] ?? []));
    if (page.nextCursor !== undefined || result.deliveries.length >= limit) {
      const next = page.nextCursor !== undefined ? index : index + 1;
      if (next < profiles.length) result.nextCursor = String(next) + "|" + (page.nextCursor ?? "");
      break;
    }
  }
  return { ...result, ...(await eventTotals(providerRegistry, profiles, query, totals)) };
}
// Sums the providers' totals and per-state counts for the filter; a profile not read for this page
// (or read from a cursor) is asked once with limit 1. Absent when no provider reports a total.
async function eventTotals(providerRegistry, profiles, query, pages) {
  let total, counts;
  for (let index = 0; index < profiles.length; index++) {
    const value = provider(providerRegistry, "event", profiles[index]);
    if (typeof value?.query !== "function") continue;
    const page = pages.get(index) ?? await value.query({ ...query, cursor: undefined, limit: 1 });
    if (Number.isSafeInteger(page?.total)) total = (total ?? 0) + page.total;
    if (page?.counts !== null && typeof page?.counts === "object")
      for (const [state, count] of Object.entries(page.counts))
        if (Number.isSafeInteger(count)) (counts ??= {})[state] = (counts[state] ?? 0) + count;
  }
  return { ...(total === undefined ? {} : { total }), ...(counts === undefined ? {} : { counts }) };
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
// Development error logs of a request wait for its request line, so the cause prints beneath it.
const heldHttpLogs = new Map();
function writeHttpLog(record) {
  const held = record?.signal === "log" && record.level === "error" && typeof record.requestId === "string" && process.env.RELKIT_DEV_LOGS === "1";
  if (!held || (!heldHttpLogs.has(record.requestId) && heldHttpLogs.size >= 256)) return writeRuntimeLog(record);
  heldHttpLogs.set(record.requestId, [...(heldHttpLogs.get(record.requestId) ?? []), record]);
}
function releaseHttpLogs(requestId) {
  const records = heldHttpLogs.get(requestId) ?? [];
  heldHttpLogs.delete(requestId);
  for (const record of records) writeRuntimeLog(record);
}
function healthResponse(status, code = 200) {
  const readiness = { environmentReady: true, providerReady: runtimeState().ready.provider && runtimeState().ready.nativeWorker && !runtimeState().stopping, databaseReady: runtimeState().ready.database && !runtimeState().stopping, authReady: runtimeState().ready.auth && !runtimeState().stopping };
  // Generation identity is for the development supervisor; production answers status and readiness only.
  const identity = environment === "production" ? {} : { graphHash, activationFingerprint, manifestGraphHash: runtimeManifest.graphHash, graphContractVersion: ${GRAPH_VERSION}, manifestContractVersion: ${MANIFEST_VERSION}, manifestGeneratorVersion: ${GENERATOR_VERSION}, ...(sourceToken === undefined ? {} : { sourceToken }), ...(generationToken === undefined ? {} : { generationToken }) };
  return Response.json({ protocol: "relkit.inspector", version: 1, status, ...identity, ...readiness }, { status: code, headers: { "x-relkit-api-version": "1", "cache-control": "no-store" } });
}
function problemResponse(status, title, code, detail) {
  return new Response(JSON.stringify({ type: "/errors/" + code, title, status, code, detail }), { status, headers: { "content-type": "application/problem+json" } });
}
function resolveRuntimeEnvironment(definition, environment, source) {
  try {
    const resolved = resolveEnv(definition, { environment, source });
    const values = { ...source };
    for (const [name, value] of Object.entries(resolved)) {
      if (value === undefined) continue;
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
