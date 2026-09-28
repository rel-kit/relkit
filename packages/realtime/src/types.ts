import type { ExpectedClientIdentity, OperationId } from "@relkit/contracts";

/** Identity and partition coordinates shared by all realtime provider requests.
 * @example const scope: RealtimeScope = { applicationId: "app", environment: "dev", channelId: "news", partition: "p", profile: "default", policyEpoch: "v1", providerEpoch: "e1", identityScope: "public", sessionEpoch: "s1" };
 */
export interface RealtimeScope extends ExpectedClientIdentity {
  readonly applicationId: string;
  readonly environment: string;
  readonly tenantScope?: string;
  readonly channelId: string;
  readonly partition: string;
  readonly profile: string;
  readonly policyEpoch: string;
  readonly providerEpoch: string;
}

/** Replay cursor bound to the provider, policy, and session epochs.
 * @example const checkpoint: ChannelCheckpoint = { ...scope, sequence: "1", historyStart: "1", expiresAt: new Date().toISOString() };
 */
export interface ChannelCheckpoint extends RealtimeScope {
  readonly sequence: string;
  readonly historyStart: string;
  readonly expiresAt: string;
}

/** Authorized channel grant with a bounded replay window.
 * @example const grant: ChannelGrant = { ...scope, grantId: "g", principalScope: "user", historyStart: "1", expiresAt: new Date().toISOString() };
 */
export interface ChannelGrant extends RealtimeScope {
  readonly grantId: string;
  readonly principalScope: string;
  readonly historyStart: string;
  readonly expiresAt: string;
}

/** Stored channel event and checkpoint returned by replay.
 * @example const record: ChannelEventRecord = { eventId: "e1", event: "posted", payload: "hi", checkpoint, encodedBytes: 20, createdAt: new Date().toISOString() };
 */
export interface ChannelEventRecord {
  readonly eventId: string;
  readonly event: string;
  readonly payload: unknown;
  readonly checkpoint: ChannelCheckpoint;
  readonly encodedBytes: number;
  readonly createdAt: string;
}

/** Provider acknowledgement for an accepted channel event.
 * @example const receipt: TriggerReceipt = await channel.trigger({}, "posted", "hi");
 */
export interface TriggerReceipt {
  readonly accepted: true;
  readonly operationId?: OperationId;
  readonly eventId: string;
  readonly checkpoint: ChannelCheckpoint;
  readonly profile: string;
  readonly providerEpoch: string;
  readonly duplicate: boolean;
}

/** Count-only presence snapshot and freshness state.
 * @example const count: CountPresence = { connections: 1, status: "fresh", revision: "1", scope: "shared" };
 */
export interface CountPresence {
  readonly connections: number | undefined;
  readonly status: "loading" | "fresh" | "stale" | "error";
  readonly revision: string | undefined;
  readonly scope: "process" | "shared";
}

/** Member identity and validated application-visible information.
 * @example const member: PresenceMember<string> = { id: "opaque", info: "Ada" };
 */
export interface PresenceMember<Member = unknown> {
  readonly id: string;
  readonly info: Member;
}

/** Presence snapshot with a bounded member list.
 * @example const members: MemberPresence<string> = { connections: 1, status: "fresh", revision: "1", scope: "shared", memberCount: 1, members: [{ id: "opaque", info: "Ada" }], membersTruncated: false };
 */
export interface MemberPresence<Member = unknown> extends CountPresence {
  readonly memberCount: number | undefined;
  readonly members: readonly PresenceMember<Member>[];
  readonly membersTruncated: boolean;
}

/** Count-only or member presence returned by a provider.
 * @example const snapshot: PresenceSnapshot = await provider.readPresence(read);
 */
export type PresenceSnapshot<Member = unknown> = CountPresence | MemberPresence<Member>;
