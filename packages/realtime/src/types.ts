import type { ExpectedClientIdentity, OperationId } from "@relkit/contracts";

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

export interface ChannelCheckpoint extends RealtimeScope {
  readonly sequence: string;
  readonly historyStart: string;
  readonly expiresAt: string;
}

export interface ChannelGrant extends RealtimeScope {
  readonly grantId: string;
  readonly principalScope: string;
  readonly historyStart: string;
  readonly expiresAt: string;
}

export interface ChannelEventRecord {
  readonly eventId: string;
  readonly event: string;
  readonly payload: unknown;
  readonly checkpoint: ChannelCheckpoint;
  readonly encodedBytes: number;
  readonly createdAt: string;
}

export interface TriggerReceipt {
  readonly accepted: true;
  readonly operationId?: OperationId;
  readonly eventId: string;
  readonly checkpoint: ChannelCheckpoint;
  readonly profile: string;
  readonly providerEpoch: string;
  readonly duplicate: boolean;
}

export interface CountPresence {
  readonly connections: number | undefined;
  readonly status: "loading" | "fresh" | "stale" | "error";
  readonly revision: string | undefined;
  readonly scope: "process" | "shared";
}

export interface PresenceMember<Member = unknown> {
  readonly id: string;
  readonly info: Member;
}

export interface MemberPresence<Member = unknown> extends CountPresence {
  readonly memberCount: number | undefined;
  readonly members: readonly PresenceMember<Member>[];
  readonly membersTruncated: boolean;
}

export type PresenceSnapshot<Member = unknown> = CountPresence | MemberPresence<Member>;
