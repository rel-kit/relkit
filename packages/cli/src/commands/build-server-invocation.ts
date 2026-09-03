export const SERVER_INVOCATION_SOURCE = `
async function invokeHttp(request) {
  const providerRegistry = await providerStartup;
  if (providerRegistry === undefined) throw new Error("Provider registry unavailable.");
  const target = targetFor(request.functionId);
  let invocationSpanId;
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
    serviceId: graph.nodes.find((node) => node.kind === "function" && node.id === request.functionId)?.domainId,
    ...(request.parent === undefined ? {} : { parent: request.parent }),
    ...(request.inputSchema === undefined ? {} : { inputSchema: request.inputSchema }),
    ...(request.outputSchema === undefined ? {} : { outputSchema: request.outputSchema }),
    ...(request.errors === undefined ? {} : { errors: request.errors }),
    ...(request.toolHooks === undefined ? {} : { toolHooks: request.toolHooks }),
    hooks: { observability: telemetry, context: invocationContext,
      ...(environment !== "production" && process.env.RELKIT_DEV_LOGS === "1" ? {
        onSpanStart: (span) => { invocationSpanId = span.spanId; },
        context: (context) => invocationContext(context, invocationSpanId),
      } : {}),
    },
  });
  const task = request.auth === undefined
    ? execute()
    : authRequestStorage.run(request.auth, execute);
  activeInvocations.add(task);
  try {
    return await task;
  } finally {
    activeInvocations.delete(task);
  }
}

async function invocationContext({ invocation, signal, env, time }, spanId) {
  const write = (level, message, fields = {}) => {
    const record = telemetry.collect({ version: 1, signal: "log", timestamp: time.now().toISOString(), level, component: invocation.functionId, message, fields, functionId: invocation.functionId, serviceId: invocation.serviceId, invocationId: invocation.id, traceId: invocation.traceId,
      ...(environment !== "production" && process.env.RELKIT_DEV_LOGS === "1" ? { spanId, correlationId: invocation.correlationId, generationId, graphHash, source: invocation.source } : {}) });
    writeRuntimeLog(record);
  };
  const logger = (level) => (message, fields) => write(level, message, fields);
  const activeAuth = authRequestStorage.getStore();
  const auth = Object.freeze({ getSession: () => activeAuth?.getSession() ?? Promise.resolve(null) });
  const log = Object.freeze({ trace: logger("trace"), debug: logger("debug"), info: logger("info"), warn: logger("warn"), error: logger("error") });
  const resolved = await contextResolver.resolve({ signal, log });
  const database = databaseStartup === undefined
    ? Object.freeze({})
    : (await databaseStartup).context;
  return { invocation, signal, env, time, auth, log, database, ...resolved };
}

function createDatabaseRegistration(node, services, env) {
  if (node === undefined) return undefined;
  const service = services?.[node.id];
  if (service === undefined) return Promise.reject(new Error("Drizzle service is unavailable."));
  return activateDrizzleService(service, env);
}

function createBetterAuthRegistration(node, services, database) {
  if (node === undefined) return undefined;
  if (database === undefined) return Promise.reject(new Error("Better Auth requires Drizzle."));
  const service = services?.[node.id];
  if (service === undefined) return Promise.reject(new Error("Better Auth service is unavailable."));
  return database.then((active) => activateBetterAuthService(service, active, node.capability.basePath));
}

function createAuthRegistration(applicationGraph, routes = {}, authStartup) {
  const brand = Symbol.for("relkit.better-auth.handler");
  for (const [routeId, route] of Object.entries(routes)) {
    if (route?.auth?.kind !== "better-auth") continue;
    const registration = route.handler?.[brand];
    if (registration?.kind !== "better-auth") throw new Error("Better Auth registration is unavailable.");
    const trigger = applicationGraph.nodes.find((node) => node.kind === "trigger" && node.id === routeId);
    const publicPaths = trigger?.config?.runtimePaths ?? [trigger?.config?.path].filter(Boolean);
    return createHttpAuthRuntime({
      protected: route.auth.protected,
      publicPaths,
      getSession: async (headers) => {
        const auth = await authStartup;
        return (await auth.api.getSession({ headers })) ?? null;
      },
    });
  }
  return undefined;
}

`;
