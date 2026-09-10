import { createHash } from "node:crypto";
import { canonicalJson, REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import type { RealtimeDispatcher } from "./dispatch.js";
import { parseOperationId } from "./operation-id.js";
import type { RealtimeProvider, RealtimeLimits } from "./provider.js";

export interface ProviderRealtimeDispatcherOptions {
  readonly applicationId: string;
  readonly environment: string;
  readonly generationId: string;
  readonly publicFingerprint: string;
  readonly provider: (profile: string) => Promise<RealtimeProvider> | RealtimeProvider;
  readonly limits?: Partial<RealtimeLimits>;
}

export function createProviderRealtimeDispatcher(
  options: ProviderRealtimeDispatcherOptions,
): RealtimeDispatcher {
  const limits: RealtimeLimits = {
    maxEventBytes: REALTIME_RUNTIME_LIMITS.channelFrameBytes,
    maxRetainedBytes: REALTIME_RUNTIME_LIMITS.retainedChannelBytes,
    maxPartitions: REALTIME_RUNTIME_LIMITS.activeRealtimePartitions,
    maxConnections: REALTIME_RUNTIME_LIMITS.liveConnections,
    maxPresenceMembers: REALTIME_RUNTIME_LIMITS.presenceMembers,
    ...options.limits,
  };
  return {
    trigger: async ({ channel, params, event, payload, options: triggerOptions }) => {
      const now = Date.now();
      const operationId = triggerOptions?.idempotencyKey;
      if (operationId !== undefined)
        parseOperationId(operationId, {
          now,
          receiptWindowMs: REALTIME_RUNTIME_LIMITS.triggerReceiptMs,
        });
      const initial = scopeFor(options, channel.id, channel.profile ?? "default", params);
      const provider = await options.provider(initial.profile);
      const scope = { ...initial, providerEpoch: await provider.getEpoch() };
      const occurredAt = new Date(now).toISOString();
      const semanticDigest = digest({ scope, event, payload });
      return provider.append({
        ...scope,
        ...(operationId === undefined
          ? {}
          : {
              operationId,
              semanticDigest,
              receiptExpiresAt: new Date(
                now + REALTIME_RUNTIME_LIMITS.triggerReceiptMs,
              ).toISOString(),
            }),
        event,
        payload,
        encodedBytes: bytes({ event, payload, occurredAt }),
        occurredAt,
        ...(channel.replay === undefined ? {} : channel.replay),
        limits,
      });
    },
    getPresence: async ({ channel, params }) => {
      const initial = scopeFor(options, channel.id, channel.profile ?? "default", params);
      const provider = await options.provider(initial.profile);
      const scope = { ...initial, providerEpoch: await provider.getEpoch() };
      return provider.readPresence({
        ...scope,
        maxMembers:
          typeof channel.presence === "object"
            ? channel.presence.maxMembers
            : limits.maxPresenceMembers,
      });
    },
  };
}

function scopeFor(
  options: ProviderRealtimeDispatcherOptions,
  channelId: string,
  profile: string,
  params: unknown,
) {
  return {
    applicationId: options.applicationId,
    environment: options.environment,
    channelId,
    partition: digest(params),
    profile,
    policyEpoch: options.publicFingerprint,
    providerEpoch: "",
    identityScope: `runtime:${options.generationId}`,
    sessionEpoch: options.generationId,
  };
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(value as never))
    .digest("hex")}`;
}

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
