import type { AgentThreadOptions } from "./agent-hook-types.types.js";

/** The thread selected for the view's current agent observation. */
export type ObservationRequest = { readonly threadId: string; readonly revision: number };

/** Explicit caller thread authority for an agent submission. */
export type InvocationOptions = AgentThreadOptions & { readonly resume?: boolean };
