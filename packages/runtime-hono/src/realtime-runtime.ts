import type { MaybePromise } from "@relkit/contracts";
import type { RealtimeProvider } from "@relkit/realtime";
import type { HttpAuthInvocation } from "./auth.js";

export interface RealtimeRuntime {
  readonly applicationId: string;
  readonly environment: string;
  readonly provider: (profile: string) => MaybePromise<RealtimeProvider>;
  readonly trustedContext?: (input: {
    readonly request: Request;
    readonly auth?: HttpAuthInvocation;
  }) => MaybePromise<unknown>;
}
