export const LOCAL_PROJECT_LEASE_VERSION = 1 as const;

export type LocalProjectLeaseMode = "attached" | "detached";
export type LocalProjectLeaseStatus = "acquired" | "adopted" | "recovered";

export interface LocalProjectLease {
  readonly version: typeof LOCAL_PROJECT_LEASE_VERSION;
  readonly localProjectId: string;
  readonly mode: LocalProjectLeaseMode;
  readonly sessionId: string;
  readonly generationId: string;
  readonly createdAt: string;
  readonly ownerPid?: number;
}

export interface AcquireLocalProjectLeaseOptions {
  readonly mode: LocalProjectLeaseMode;
  readonly sessionId: string;
  readonly pid?: number;
  readonly now?: () => Date;
  readonly isProcessAlive?: (pid: number) => boolean;
}

export interface LocalProjectLeaseHandle {
  readonly lease: LocalProjectLease;
  readonly status: LocalProjectLeaseStatus;
  readonly release: () => void;
}

export type LocalProjectLeaseErrorCode =
  "RELKIT_LOCAL_LEASE_HELD" | "RELKIT_LOCAL_LEASE_BUSY" | "RELKIT_LOCAL_LEASE_INVALID";

export class LocalProjectLeaseError extends Error {
  constructor(
    readonly code: LocalProjectLeaseErrorCode,
    message: string,
    readonly owner?: LocalProjectLease,
  ) {
    super(message);
    this.name = "LocalProjectLeaseError";
  }
}
