import type { AgentExecutionEvent } from "./runtime-events.js";

/** Agent and parent context attached to a public native event. */
export type NativeExecutionContext = Pick<AgentExecutionEvent, "agent" | "parent">;
