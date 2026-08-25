import { createInspectorApiClient } from "./api";
import { createInspectorStream, type InspectorStreamOptions } from "./stream";

export const INSPECTOR_BACKEND_PROXY = "/_zsys/backend" as const;
export const INSPECTOR_BACKEND_CONNECTED_EVENT = "zsys:inspector-connected" as const;

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
  if (typeof value !== "string" || value.trim() === "") return undefined;
  if (typeof window === "undefined" || !isLocalInspectorProxy(value)) return value;
  return INSPECTOR_BACKEND_PROXY;
}

function isLocalInspectorProxy(value: string): boolean {
  try {
    const configured = new URL(value);
    const current = new URL(window.location.href);
    return (
      configured.pathname === INSPECTOR_BACKEND_PROXY &&
      configured.port === current.port &&
      isLocalHost(configured.hostname) &&
      isLocalHost(current.hostname)
    );
  } catch {
    return false;
  }
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
