import {
  INSPECTOR_API_PROTOCOL,
  INSPECTOR_API_VERSION,
  InspectorApiError,
  type InspectorObject,
  type InspectorResponseProtocol,
} from "./api-types";

/**
 * Whether an error response is an Inspector envelope. A response that is not one (a router's
 * Problem Details 404, a proxy's 502) is reported by its status alone.
 */
export function isEnvelope(
  payload: unknown,
  responseProtocols: readonly InspectorResponseProtocol[] = [INSPECTOR_API_PROTOCOL],
): payload is InspectorObject {
  try {
    assertEnvelope(payload, new Headers(), responseProtocols);
    return true;
  } catch {
    return false;
  }
}

export function assertEnvelope(
  payload: unknown,
  headers: Headers,
  responseProtocols: readonly InspectorResponseProtocol[] = [INSPECTOR_API_PROTOCOL],
): void {
  const object =
    payload !== null && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as InspectorObject)
      : undefined;
  const headerVersion = headers.get("x-relkit-api-version");
  if (
    !responseProtocols.includes(object?.protocol as InspectorResponseProtocol) ||
    object?.version !== INSPECTOR_API_VERSION ||
    (headerVersion !== null && headerVersion !== String(INSPECTOR_API_VERSION))
  )
    throw new InspectorApiError(
      "Inspector protocol version is unsupported",
      "RELKIT_INSPECTOR_PROTOCOL_MISMATCH",
      undefined,
      "protocol",
    );
}
