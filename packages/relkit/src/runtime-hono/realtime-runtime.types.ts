import type { MaybePromise } from "../contracts/index.js";
import type { RealtimeProvider } from "../realtime/index.js";
import type { HttpAuthInvocation } from "./auth.js";

/** Contract for realtime runtime used by realtime runtime. */
export interface RealtimeRuntime {
  readonly applicationId: string;
  readonly environment: string;
  readonly provider: (profile: string) => MaybePromise<RealtimeProvider>;
  readonly trustedContext?: (input: {
    readonly request: Request;
    readonly auth?: HttpAuthInvocation;
  }) => MaybePromise<unknown>;
}
