export const SERVER_REGISTRATION_SOURCE = `
function bindAgents() {
  for (const node of plan.agents) {
    const agent = runtimeManifest.agents?.[node.id];
    if (agent === undefined) throw new Error(\`Agent descriptor "\${node.id}" is unavailable.\`);
    const functionId = \`relkit.agent.\${node.id}.invoke\`;
    const handler = createGeneratedAgentFunction(
      node.id,
      (input, context) => invokeBoundAgent(node, agent, input, context),
    );
    executableManifest.functions[functionId] = handler;
    if (node.backendBucketId !== undefined) {
      executableManifest.targets[functionId] = {
        id: functionId,
        input: agent.input,
        output: agent.output,
        handler,
        dependencies: { buckets: { backend: agent.backend } },
      };
    }
  }
}
function resolveClientIdentityRegistration(request, session) {
  const userId = session?.user?.id;
  const sessionId = session?.session?.id;
  if (typeof userId === "string" && typeof sessionId === "string") return {
    identityScope: runtimeDigest("identity:" + userId),
    sessionEpoch: runtimeDigest("session:" + sessionId + ":" + String(session.session.updatedAt ?? "")),
  };
  let visitor = cookieValue(request, "relkit_visitor");
  let csrf = cookieValue(request, "relkit_csrf");
  const setCookies = [];
  const secure = environment === "production" ? "; Secure" : "";
  if (visitor === undefined) {
    visitor = crypto.randomUUID();
    setCookies.push("relkit_visitor=" + visitor + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000" + secure);
  }
  if (csrf === undefined) {
    csrf = crypto.randomUUID();
    setCookies.push("relkit_csrf=" + csrf + "; Path=/; SameSite=Lax; Max-Age=2592000" + secure);
  }
  return { identityScope: runtimeDigest("visitor:" + visitor), sessionEpoch: runtimeDigest("visitor-session:" + visitor), setCookies };
}
function transportSecurityRegistration() {
  const configured = process.env.RELKIT_ALLOWED_ORIGINS;
  const allowedOrigins = configured === undefined
    ? []
    : configured.split(",").map((value) => value.trim()).filter(Boolean);
  return { allowedOrigins, trustedService: (request) => environment !== "production" && request.headers.get("origin") === null, validateCsrf: (request, token) => cookieValue(request, "relkit_csrf") === token };
}
function cookieValue(request, name) {
  const match = request.headers.get("cookie")?.split(";").map((value) => value.trim()).find((value) => value.startsWith(name + "="));
  return match === undefined ? undefined : decodeURIComponent(match.slice(name.length + 1));
}
function runtimeDigest(value) {
  return "sha256:" + createHash("sha256").update(value).digest("hex");
}
function routeMiddlewareContext({ middlewareId, signal, request, auth }) {
  const time = Object.freeze({
    now: () => new Date(),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  });
  const write = (level, message, fields = {}) => {
    const execution = currentExecutionContext();
    const record = telemetry.collect({
      version: 2, signal: "log", timestamp: time.now().toISOString(),
      level, component: middlewareId, message, fields,
      requestId: execution?.requestId, originRequestId: execution?.originRequestId,
      traceId: execution?.span.traceId, spanId: execution?.span.spanId,
      invocationId: execution?.invocationId, correlationId: execution?.correlationId,
    });
    writeRuntimeLog(record);
  };
  const logger = (level) => (message, fields) => write(level, message, fields);
  return {
    signal,
    env: values,
    auth: auth ?? Object.freeze({ getSession: () => Promise.resolve(null) }),
    time,
    trace: publicTrace,
    log: Object.freeze({
      trace: logger("trace"), debug: logger("debug"), info: logger("info"),
      warn: logger("warn"), error: logger("error"),
    }),
  };
}
async function invokeBoundAgent(node, agent, input, context) {
  let modelRegistry;
  if (node.execution !== "graph" && node.modelSource !== "native") {
    const providerRegistry = await providerStartup;
    if (providerRegistry === undefined) throw new Error("Provider registry unavailable.");
    modelRegistry = provider(providerRegistry, "model", node.profile);
    if (modelRegistry === undefined) throw new Error("Model provider registry unavailable.");
  }
  const trigger = context.trigger?.kind === "agent-run" ? context.trigger : undefined;
  return invokeAgent({
    agent, input, ...(modelRegistry === undefined ? {} : { modelRegistry }), tools: runtimeManifest.tools ?? {},
    environment: values,
    engine: { invoke: (request) => invokeHttp({ ...request, progressSink: request.progressSink ?? trigger?.progressSink }) },
    invocationId: context.invocation.id, traceId: context.invocation.traceId, signal: context.signal,
    ...(typeof trigger?.approval === "function"
      ? { approval: trigger.approval }
      : {}),
    ...(Array.isArray(trigger?.messages) ? { messages: trigger.messages } : {}),
    ...(typeof trigger?.steering?.drain === "function" ? { steering: trigger.steering } : {}),
    ...(typeof trigger?.contentSink?.emitOutput === "function" ? { contentSink: trigger.contentSink } : {}),
    ...(typeof trigger?.threadId === "string" ? { threadId: trigger.threadId } : {}),
    ...(node.backendBucketId === undefined
      ? {}
      : { bucketBackend: context.buckets.backend }),
    ...(trigger?.resume === true ? { resume: true } : {}),
    timeoutMs: agent.limits.timeoutMs,
    hooks: { observability: telemetry },
  });
}
`;
