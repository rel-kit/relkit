import { createInspectorApiClient } from "./api";
import { createInspectorStream, type InspectorStreamOptions } from "./stream";

export const INSPECTOR_BACKEND_PROXY = "/_zsys/backend" as const;

export function inspectorBackendUrl(): string {
  return configuredBackendUrl() ?? INSPECTOR_BACKEND_PROXY;
}

export function createInspectorClient() {
  return createInspectorApiClient({ baseUrl: inspectorBackendUrl() });
}

export function createInspectorBackendStream(options: InspectorStreamOptions = {}) {
  return createInspectorStream({
    ...options,
    baseUrl: configuredBackendUrl() ?? options.baseUrl ?? INSPECTOR_BACKEND_PROXY,
  });
}

function configuredBackendUrl(): string | undefined {
  const value = process.env.NEXT_PUBLIC_ZSYS_BACKEND_URL;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
