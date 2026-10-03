import type { agentClientEvents } from "@relkit/agents";
import type { agentContext } from "./agent-rpc-support.js";
import type { clientAgentSnapshot } from "./agent-compatibility.js";

/** Public observation frames after compatibility projection and fresh authorization. */
export type AgentObservationFrame =
  | { readonly kind: "event"; readonly event: ReturnType<typeof agentClientEvents>[number] }
  | { readonly kind: "snapshot"; readonly snapshot: ReturnType<typeof clientAgentSnapshot> }
  | {
      readonly kind: "gap";
      readonly reason: NonNullable<
        Awaited<
          ReturnType<Awaited<ReturnType<typeof agentContext>>["provider"]["readJournal"]>
        >["gap"]
      >;
      readonly snapshot: ReturnType<typeof clientAgentSnapshot>;
    };
