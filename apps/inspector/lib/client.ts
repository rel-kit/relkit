import { createInspectorApiClient } from "./api";
import { createInspectorStream, type InspectorStreamOptions } from "./stream";

export function inspectorBackendUrl(): string | undefined {
  const value = process.env.NEXT_PUBLIC_ZSYS_BACKEND_URL;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function createInspectorClient() {
  const baseUrl = inspectorBackendUrl();
  return createInspectorApiClient(baseUrl === undefined ? {} : { baseUrl });
}

export function createInspectorBackendStream(options: InspectorStreamOptions = {}) {
  const baseUrl = inspectorBackendUrl();
  return createInspectorStream(baseUrl === undefined ? options : { ...options, baseUrl });
}
