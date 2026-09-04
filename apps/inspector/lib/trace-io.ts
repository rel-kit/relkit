import type { InspectorObject } from "./api-types";

export interface TraceIo {
  readonly input: unknown;
  readonly output: unknown;
  readonly inputCapture?: InspectorObject;
  readonly outputCapture?: InspectorObject;
  readonly metadata: InspectorObject;
}

export function traceIo(span: InspectorObject, request?: InspectorObject): TraceIo {
  const input: Record<string, unknown> = {};
  const output: Record<string, unknown> = {};
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record(span.attributes))) {
    if (isIdentityKey(key)) metadata[key] = value;
    else if (isOutputKey(key)) output[fieldName(key)] = value;
    else if (isInputKey(key)) input[fieldName(key)] = value;
    else metadata[key] = value;
  }
  if (request && !span.parentSpanId) {
    add(input, "method", request.method);
    add(input, "route", requestRoute(request));
    add(input, "bytes", request.requestBytes);
    add(output, "statusCode", request.status);
    add(output, "bytes", request.responseBytes);
  }
  const inputCapture = record(span.inputCapture);
  const outputCapture = record(span.outputCapture);
  return {
    input: Object.keys(inputCapture).length ? inputCapture.content : input,
    output: Object.keys(outputCapture).length ? outputCapture.content : output,
    ...(Object.keys(inputCapture).length ? { inputCapture } : {}),
    ...(Object.keys(outputCapture).length ? { outputCapture } : {}),
    metadata,
  };
}

export function requestForSpan(
  span: InspectorObject,
  requests: readonly InspectorObject[],
): InspectorObject | undefined {
  const matches = requests.filter(
    (request) =>
      (text(span.requestId) !== "" && request.requestId === span.requestId) ||
      (text(span.traceId) !== "" && request.traceId === span.traceId),
  );
  return matches.find((request) => request.phase === "completed") ?? matches[0];
}

export function eventData(attributes: unknown): InspectorObject {
  return record(attributes);
}

function isInputKey(key: string): boolean {
  return /(?:^|\.)(?:request|input|argument|arguments)(?:\.|$)/i.test(key);
}

function isOutputKey(key: string): boolean {
  return /(?:^|\.)(?:response|output|result)(?:\.|$)/i.test(key);
}

function isIdentityKey(key: string): boolean {
  return /^(?:relkit\.(?:request|origin_request|invocation|function)\.id|http\.request\.id|trace\.id|span\.id)$/i.test(
    key,
  );
}

function fieldName(key: string): string {
  if (key === "http.request.method") return "method";
  if (key === "http.request.body.size") return "bytes";
  if (key === "http.response.status_code") return "statusCode";
  if (key === "http.response.body.size") return "bytes";
  return key.split(".").at(-1)?.replaceAll("_", " ") ?? key;
}

function add(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined && value !== "") target[key] = value;
}

function requestRoute(request: InspectorObject): unknown {
  const normalized = text(request.normalizedRoute);
  return normalized.startsWith("/") ? normalized : (request.rawPath ?? normalized);
}

function record(value: unknown): InspectorObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
