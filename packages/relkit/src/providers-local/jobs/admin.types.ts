import type {
  JOB_ADMIN_PROTOCOL,
  JOB_ADMIN_VERSION,
  JobActionContract,
  JobActionRequest,
  JobAdminActionRecord,
  JobAdminActionSink,
  JobAdminMode,
  JobQueryContract,
  JobQueryRequest,
  JobStatusContract,
} from "./admin-contracts.js";

/** Local administration mode and isolated audit/clock hooks. */
export interface JobAdminOptions {
  readonly mode?: JobAdminMode;
  readonly environment?: JobAdminMode;
  readonly enabled?: boolean;
  readonly now?: () => number;
  readonly createActionId?: () => string;
  readonly onAction?: JobAdminActionSink;
}

/** Versioned job inspection and audited development mutation interface. */
export interface JobAdmin {
  readonly protocol: typeof JOB_ADMIN_PROTOCOL;
  readonly version: typeof JOB_ADMIN_VERSION;
  readonly status: (instanceId: string) => JobStatusContract | undefined;
  readonly query: (request?: JobQueryRequest) => JobQueryContract;
  readonly retry: (request: string | JobActionRequest) => Promise<JobActionContract>;
  readonly cancel: (request: string | JobActionRequest) => Promise<JobActionContract>;
  readonly deadLetter: (request: string | JobActionRequest) => Promise<JobActionContract>;
  readonly actions: () => readonly JobAdminActionRecord[];
}
