import type { Effect } from "effect";
import type {
  createTestHttpListener,
  TestHttpListener,
  TestHttpListenerOptions,
} from "./http-listener.js";

/** Replaceable native listener acquisition authority for one HTTP owner. */
export interface HttpPlatformService {
  readonly listen: typeof createTestHttpListener;
}

/** Effect listener admission and complete shutdown over native listener handles. */
export interface HttpOwnerService {
  readonly listen: (options?: TestHttpListenerOptions) => Effect.Effect<TestHttpListener, unknown>;
  readonly close: Effect.Effect<void, unknown>;
}

/** Listener handles and real startup completion retained by one scoped HTTP owner. */
export interface HttpOwnerState {
  closed: boolean;
  readonly listeners: Set<TestHttpListener>;
  readonly pending: Set<Promise<unknown>>;
  readonly startupReleaseFailures: unknown[];
  closing: Promise<void> | undefined;
}
