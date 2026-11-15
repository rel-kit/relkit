/** The one word the sidebar's footer shows for the Inspector's health. */
import { applicationLabel } from "./stream-application-text";
import { historyAvailability, type InspectorState } from "./stream-application";

/**
 * The stream when it is down, otherwise the application session; a connected application with
 * history that cannot be read is "history unavailable", never "connected" (NF-13).
 * @param state - The Inspector's stream, application and history state.
 * @param graphFailed - The graph could not be read.
 * @returns `connected` only when everything the pages need works.
 */
export function sidebarStatus(state: InspectorState, graphFailed: boolean): string {
  if (state.stream !== "connected") return state.stream;
  if (state.application.state !== "connected" && state.application.state !== "checking")
    return applicationLabel(state.application.state);
  if (graphFailed) return "offline";
  return historyAvailability(state) === "degraded" ? "history unavailable" : "connected";
}
