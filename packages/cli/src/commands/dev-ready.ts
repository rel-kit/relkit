import type { DevLog } from "./dev.js";

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
      openapi: `${backend}/_zsys/v1/openapi.json`,
      apiReference: `${backend}/_zsys/v1/api-reference`,
      ...(inspectorPort === undefined ? {} : { inspector: `http://127.0.0.1:${inspectorPort}` }),
    },
  });
}
