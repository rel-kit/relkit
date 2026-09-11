import type { AgentStateProvider } from "@relkit/agents";
import type { MaybePromise } from "@relkit/contracts";
import type { HttpAuthInvocation } from "./auth.js";

export interface AgentRuntime {
  readonly applicationId: string;
  readonly environment: string;
  readonly generationId: string;
  readonly publicFingerprint: string;
  readonly signal?: AbortSignal;
  readonly track?: (task: Promise<void>) => void;
  readonly provider: (profile: string) => MaybePromise<AgentStateProvider>;
  readonly trustedContext?: (input: {
    readonly request: Request;
    readonly auth?: HttpAuthInvocation;
  }) => MaybePromise<unknown>;
}
