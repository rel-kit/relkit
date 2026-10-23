/** Coordinates native state and tool projection for public execution sinks without exposing undeclared private state. This companion preserves the native input and output types without starting runtime work. */

import type { AgentExecutionEvent } from "@relkit/agents/internal/runtime-events";

/** Agent and parent context attached to a public native event. */
export type NativeExecutionContext = Pick<AgentExecutionEvent, "agent" | "parent">;
