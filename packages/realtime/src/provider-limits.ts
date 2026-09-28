import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import { Effect } from "effect";
import type { RealtimeLimits } from "./provider.types.js";
import type { ProviderRealtimeDispatcherOptions } from "./provider-dispatcher.types.js";
import { observeRealtime } from "./realtime-observability.js";
/** Computes effective provider limits in the Effect path.
 * @param options - Dispatcher options with optional limit overrides.
 * @returns An Effect of the merged limits without a typed failure.
 * @example Effect.runSync(limitsForEffect(options));
 */
export const limitsForEffect = Effect.fn("Realtime.providerLimits")(
  function* (options: ProviderRealtimeDispatcherOptions): Generator<never, RealtimeLimits> {
    return {
      maxEventBytes: REALTIME_RUNTIME_LIMITS.channelFrameBytes,
      maxRetainedBytes: REALTIME_RUNTIME_LIMITS.retainedChannelBytes,
      maxPartitions: REALTIME_RUNTIME_LIMITS.activeRealtimePartitions,
      maxConnections: REALTIME_RUNTIME_LIMITS.liveConnections,
      maxPresenceMembers: REALTIME_RUNTIME_LIMITS.presenceMembers,
      ...options.limits,
    };
  },
  (effect) => observeRealtime("provider.limits", effect),
);
