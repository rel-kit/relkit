import type { ChannelCheckpoint } from "@relkit/realtime";

/**
 * Supplies a native replay cursor with complete deterministic scope authority.
 * @param sequence - Journal position to retain across reconnects.
 * @returns A contract-valid checkpoint for the shared fixture channel.
 */
export function checkpoint(sequence: string): ChannelCheckpoint {
  return {
    applicationId: "app",
    environment: "dev",
    identityScope: "public",
    sessionEpoch: "session",
    channelId: "declared",
    partition: "partition",
    profile: "default",
    policyEpoch: "policy",
    providerEpoch: "provider",
    sequence,
    historyStart: "1",
    expiresAt: "2026-01-01T00:00:00.000Z",
  };
}
