import type { ManagedRuntime } from "effect";
import type { AgentRunTasks } from "./agent-run-tasks.js";

/** Contract for runtime used by agent run tasks. */
export type Runtime = ManagedRuntime.ManagedRuntime<AgentRunTasks, never>;
