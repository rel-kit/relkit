/** Retains the original redaction records helpers and exact synthetic credential assertions. */
import { type ObservabilityRecord } from "../../../packages/observability/src/index.ts";

export const secrets = Object.freeze({
  password: "super-secret-password",
  authorization: "Bearer top-secret-token",
  cookie: "session=secret-cookie",
  apiKey: "sk-secret",
});

export const flowInput = Object.freeze({
  password: secrets.password,
  authorization: secrets.authorization,
  cookie: secrets.cookie,
  OPENAI_API_KEY: secrets.apiKey,
});

export const source = {
  file: "tests/security/redaction/redaction.test.ts",
  line: 1,
  column: 1,
} as const;

export const securityTraceId = "70000000000000000000000000000007";

export const securitySpanId = "7000000000000007";

export const retry = {
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none",
} as const;

export function secretLog(
  component: string,
  message: string,
  fields: Readonly<Record<string, unknown>> = flowInput,
): ObservabilityRecord {
  return {
    version: 2,
    signal: "log",
    timestamp: "2026-08-16T00:00:00.000Z",
    level: "info",
    component,
    message,
    fields,
  } as unknown as ObservabilityRecord;
}

export function unsafeLog(): ObservabilityRecord {
  return secretLog("security.unsafe", "credentials", {
    ...flowInput,
    environment: { OPENAI_API_KEY: secrets.apiKey },
  });
}

export function unsafeRequest(): ObservabilityRecord {
  return {
    version: 2,
    signal: "request",
    phase: "completed",
    requestId: "security.request",
    traceId: securityTraceId,
    generationId: "security-generation",
    graphHash: "sha256:security",
    invocationId: "security.invocation",
    startedAt: "2026-08-16T00:00:00.000Z",
    completedAt: "2026-08-16T00:00:00.001Z",
    durationMs: 1,
    method: "POST",
    rawPath: "/security?token=top-secret-token",
    normalizedRoute: "security.route",
    routeId: "security.route",
    functionId: "security.handler",
    status: 200,
    outcome: "success",
    headers: { authorization: secrets.authorization, cookie: secrets.cookie },
    requestBody: flowInput,
  } as unknown as ObservabilityRecord;
}

export function unsafeTrace(): ObservabilityRecord {
  return {
    version: 2,
    signal: "trace",
    traceId: securityTraceId,
    startedAt: "2026-08-16T00:00:00.000Z",
    spanCount: 1,
    outcome: "success",
    attributes: flowInput,
  } as unknown as ObservabilityRecord;
}

export function unsafeSpan(): ObservabilityRecord {
  return {
    version: 2,
    signal: "span",
    spanId: securitySpanId,
    invocationId: "security.invocation",
    traceId: securityTraceId,
    name: "security.handler",
    kind: "internal",
    revision: 1,
    status: "completed",
    startedAt: "2026-08-16T00:00:00.000Z",
    completedAt: "2026-08-16T00:00:00.001Z",
    attributes: flowInput,
  } as unknown as ObservabilityRecord;
}

export function unsafeJob(): ObservabilityRecord {
  return {
    version: 2,
    signal: "job",
    jobId: "security.job",
    instanceId: "security.job.1",
    functionId: "security.job",
    profile: "default",
    state: "completed",
    attempt: 1,
    acceptedAt: "2026-08-16T00:00:00.000Z",
    input: flowInput,
  } as unknown as ObservabilityRecord;
}

export function unsafeEvent(): ObservabilityRecord {
  return {
    version: 2,
    signal: "event",
    kind: "publication",
    eventId: "security.event",
    eventVersion: 1,
    instanceId: "security.event.1",
    state: "published",
    occurredAt: "2026-08-16T00:00:00.000Z",
    payload: flowInput,
  } as unknown as ObservabilityRecord;
}
