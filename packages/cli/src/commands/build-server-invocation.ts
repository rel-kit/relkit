export const SERVER_INVOCATION_SOURCE = `
async function invokeHttp(request) {
  const providerRegistry = await providerStartup;
  if (providerRegistry === undefined) throw new Error("Provider registry unavailable.");
  const target = targetFor(request.functionId);
  const execute = () => invoke({
    input: request.input,
    source: request.source ?? "http",
    registry,
    functionId: request.functionId,
    ...(target === undefined ? {} : { target }),
    ...(request.signal === undefined
      ? { signal: shutdownController.signal }
      : { signal: AbortSignal.any([request.signal, shutdownController.signal]) }),
    ...(request.traceId === undefined ? {} : { traceId: request.traceId }),
    ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
    clients: createDependencySources(providerRegistry),
    servicePolicies: runtimeManifest.services,
    ...(request.parent === undefined ? {} : { parent: request.parent }),
    ...(request.inputSchema === undefined ? {} : { inputSchema: request.inputSchema }),
    ...(request.outputSchema === undefined ? {} : { outputSchema: request.outputSchema }),
    ...(request.errors === undefined ? {} : { errors: request.errors }),
    ...(request.toolHooks === undefined ? {} : { toolHooks: request.toolHooks }),
    hooks: { observability: telemetry, context: invocationContext },
  });
  const task = request.auth === undefined
    ? execute()
    : authRequestStorage.run(request.auth, execute);
  activeInvocations.add(task);
  try {
    return await task;
  } catch (error) {
    captureRuntimeError(error, request.traceId);
    throw error;
  } finally {
    activeInvocations.delete(task);
  }
}

async function invocationContext({ invocation, signal, env, time }) {
  const write = (level, message, fields = {}) => {
    const record = telemetry.collect({ version: 1, signal: "log", timestamp: time.now().toISOString(), level, component: invocation.functionId, message, fields, functionId: invocation.functionId, serviceId: invocation.serviceId, invocationId: invocation.id, traceId: invocation.traceId });
    if (record?.signal === "log") consoleHumanSink.write(formatHumanLog(record), record);
  };
  const logger = (level) => (message, fields) => write(level, message, fields);
  const activeAuth = authRequestStorage.getStore();
  const auth = Object.freeze({ getSession: () => activeAuth?.getSession() ?? Promise.resolve(null) });
  const log = Object.freeze({ trace: logger("trace"), debug: logger("debug"), info: logger("info"), warn: logger("warn"), error: logger("error") });
  const resolved = await contextResolver.resolve({ signal, log });
  return { invocation, signal, env, time, auth, log, database: databaseContext?.() ?? Object.freeze({}), ...resolved };
}

function createDatabaseRegistration(dataModel) {
  if (dataModel === undefined) return undefined;
  const create = dataModel[Symbol.for("zsys.data-model.create-context")];
  if (typeof create !== "function") throw new Error("Data-model runtime is unavailable.");
  return create;
}

function createAuthRegistration(applicationGraph, routes = {}) {
  const brand = Symbol.for("zsys.better-auth.handler");
  for (const [routeId, route] of Object.entries(routes)) {
    if (route?.auth?.kind !== "better-auth") continue;
    const registration = route.handler?.[brand];
    if (registration?.kind !== "better-auth") throw new Error("Better Auth registration is unavailable.");
    const trigger = applicationGraph.nodes.find((node) => node.kind === "trigger" && node.id === routeId);
    const publicPaths = trigger?.config?.runtimePaths ?? [trigger?.config?.path].filter(Boolean);
    return createHttpAuthRuntime({
      protected: route.auth.protected,
      publicPaths,
      getSession: async (headers) => (await registration.auth.api.getSession({ headers })) ?? null,
    });
  }
  return undefined;
}

async function createSentry(configuration, env) {
  if (configuration === undefined) return undefined;
  const dsn = typeof configuration.dsn === "string"
    ? configuration.dsn
    : env[configuration.dsn?.name];
  if (typeof dsn !== "string" || dsn === "") return undefined;
  const sdk = await import("@sentry/bun");
  sdk.init({
    dsn,
    sendDefaultPii: false,
    ...(configuration.tracesSampleRate === undefined
      ? {}
      : { tracesSampleRate: configuration.tracesSampleRate }),
  });
  return sdk;
}

function captureRuntimeError(error, traceId) {
  if (sentry === undefined) return;
  const detail = redactFailureDetail(error);
  const safe = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  sentry.withScope((scope) => {
    if (traceId !== undefined) scope.setTag("zsys.trace_id", traceId);
    sentry.captureException(safe);
  });
}
`;
