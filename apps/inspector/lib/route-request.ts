import { InspectorApiError, type InspectorFetch } from "./api-types";
import { resolveBackendUrl } from "./backend-url";

export interface RouteInvocationInput {
  readonly path: string;
  readonly init: RequestInit;
}

export interface RouteInvocationResult {
  readonly status: number;
  readonly body: unknown;
  readonly requestId?: string;
  readonly traceId?: string;
}

export async function invokeActiveRoute(
  fetcher: InspectorFetch,
  baseUrl: string,
  inheritedHeaders: HeadersInit,
  input: RouteInvocationInput,
): Promise<RouteInvocationResult> {
  const headers = new Headers(inheritedHeaders);
  new Headers(input.init.headers).forEach((value, key) => headers.set(key, value));
  headers.set("accept", "application/json");
  let response: Response;
  try {
    response = await fetcher(resolveBackendUrl(baseUrl, input.path), { ...input.init, headers });
  } catch {
    throw new InspectorApiError(
      "Active backend is disconnected",
      "ZSYS_INSPECTOR_DISCONNECTED",
      undefined,
      "network",
    );
  }
  return {
    status: response.status,
    body: await readBody(response),
    ...headerValue(response, "x-request-id", "requestId"),
    ...headerValue(response, "x-trace-id", "traceId"),
  };
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function headerValue(
  response: Response,
  header: string,
  key: "requestId" | "traceId",
): Record<string, string> {
  const value = response.headers.get(header);
  return value === null || value === "" ? {} : { [key]: value };
}
