import type { DevLog } from "./dev.js";

/**
 * Emits the established ready links after activation succeeds.
 * @param log - Borrowed admitted-log edge.
 * @param hostname - Stable proxy hostname.
 * @param backendPort - Stable listener port.
 * @param inspectorPort - Optional separate inspector listener.
 * @returns No value; only the existing ready event is presented.
 */
export function logDevReady(
  log: DevLog,
  hostname: string,
  backendPort: number,
  inspectorPort?: number,
): void {
  const backend = `http://${hostname}:${backendPort}`;
  log({
    level: "info",
    event: "dev.ready",
    fields: {
      backend,
      openapi: `${backend}/_relkit/v1/openapi.json`,
      apiReference: `${backend}/_relkit/v1/api-reference`,
      ...(inspectorPort === undefined ? {} : { inspector: `http://127.0.0.1:${inspectorPort}` }),
    },
  });
}
