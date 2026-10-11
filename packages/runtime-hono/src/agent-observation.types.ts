/**
 * Shares precise public frames, page state and per-request authorization between
 * observation workflows. Checkpoints enter these contracts only after decoding;
 * live provider/context authority is never persisted or captured across requests.
 */
import type { agentClientEvents } from "@relkit/agents/client-events";
import type { JournalCheckpoint } from "@relkit/contracts";
import type { Effect, Stream } from "effect";
import type { agentContext } from "./agent-rpc-support.js";
import type { AgentInput } from "./agent-rpc-support.js";
import type { HttpBoundaryError } from "./http-effect.js";
import type { RpcContext } from "./rpc.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
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

/** Cursor plus whether the following page must wait for new journal content. */
export interface ObservationPageState {
  readonly after: JournalCheckpoint;
  readonly wait: boolean;
}

/** Freshly authorized native provider scope for this request only. */
export type ObservationAccess = Awaited<ReturnType<typeof agentContext>>;

/** Reauthorization is repeated before pages and individual emitted frames. */
export type ObservationAuthorize = () => Effect.Effect<ObservationAccess, HttpBoundaryError>;

/** Stream service contract shared by live implementation and deterministic test Layers. */
export interface AgentObservationOperations {
  readonly observe: (
    input: AgentInput,
    context: RpcContext,
    options: RouteMaterializationOptions,
    signal?: AbortSignal,
  ) => Stream.Stream<AgentObservationFrame, HttpBoundaryError>;
}
