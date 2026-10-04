import type { Context } from "hono";
import type { ResolvedActiveGeneration } from "../shared.js";

/** Native jobs-route ingress enforcing Inspector authorization and active generation availability. */
export type InspectorGuard = (
  handler: (context: Context, generation?: ResolvedActiveGeneration) => Promise<Response>,
) => (context: Context) => Promise<Response>;
