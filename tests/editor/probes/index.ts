/** Every editor position the survey measures, in the order of the survey table. */
import { defineAppProbes } from "./define-app.js";
import { functionsProbes } from "./functions.js";
import { handlerProbes } from "./handler.js";
import { routesEventsProbes } from "./routes-events.js";
import { resourcesProbes } from "./resources.js";
import { runtimeClientProbes } from "./runtime-client.js";
import type { Probe } from "./probe.js";

export type { Cause, Probe, Verdict } from "./probe.js";

export const PROBES: readonly Probe[] = [
  ...defineAppProbes,
  ...functionsProbes,
  ...handlerProbes,
  ...routesEventsProbes,
  ...resourcesProbes,
  ...runtimeClientProbes,
];
