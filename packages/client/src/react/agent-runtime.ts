import { runExecutionSync } from "@relkit/contracts/operation";
import { Layer, ManagedRuntime } from "effect";
import { AgentOperations, AgentOperationsLive } from "./agent-operations.service.js";
import { pendingOperationsLayer } from "./pending.service.js";

// The shared adapter owns no native resources: native work belongs to call fibers.
export const agentRuntime = ManagedRuntime.make(
  AgentOperationsLive.pipe(Layer.provide(pendingOperationsLayer())),
);
/** Once-acquired service used by synchronous constructors and Promise adapters. */
export const agentOperations = runExecutionSync(agentRuntime, AgentOperations);
