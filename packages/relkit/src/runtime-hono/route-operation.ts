/** How the typed client sees a route: its operation kind and its declared error codes. */
import type { HttpTriggerRegistration } from "../graph/index.js";
import { isRecord } from "./materialize-routes-utils.js";

/** Collect declared route error IDs and their HTTP statuses.
 * @param trigger - Compiled HTTP trigger registration.
 * @returns Error/status tuples from supported response declarations.
 * @example errorStatuses(trigger); // [["orders.not-found", 404]]
 */
export function errorStatuses(trigger: HttpTriggerRegistration): [string, number][] {
  return Array.isArray(trigger.config.responses)
    ? trigger.config.responses.flatMap((entry) =>
        isRecord(entry) && typeof entry.errorId === "string" && typeof entry.status === "number"
          ? [[entry.errorId, entry.status]]
          : [],
      )
    : [];
}

/** Use an explicit client operation or infer it from the HTTP method.
 * @param trigger - Compiled HTTP trigger registration.
 * @returns Query for safe read methods, otherwise mutation.
 * @example routeOperation(trigger); // "query"
 */
export function routeOperation(trigger: HttpTriggerRegistration): "query" | "mutation" {
  const configured = trigger.config.client;
  if (configured !== false && configured?.operation !== undefined) return configured.operation;
  return ["GET", "HEAD", "OPTIONS"].includes(trigger.config.method) ? "query" : "mutation";
}
