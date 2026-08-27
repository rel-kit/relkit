import {
  INSPECTOR_API_PROTOCOL,
  INSPECTOR_API_VERSION,
  InspectorApiError,
  type InspectorObject,
  type InspectorResponseProtocol,
} from "./api-types";

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
