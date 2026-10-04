import type { JournalCheckpoint } from "@relkit/contracts";
import type { ClientHeaders } from "../index.types.js";

/** Native HTTP configuration for the browser-safe agent SSE edge. */
export interface AgentSseClientOptions {
  readonly baseUrl: string;
  readonly credentials: NonNullable<RequestInit["credentials"]>;
  readonly headers?: ClientHeaders;
  readonly fetch: typeof globalThis.fetch;
}
/** Existing selective observation input authority. */
export interface AgentSseObserveInput {
  readonly agentId: string;
  readonly threadId: string;
  readonly runId?: string;
  readonly after: JournalCheckpoint;
}
