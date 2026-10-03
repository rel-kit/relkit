import type {
  JobAdminMode,
  JobAdminAction,
  JobAdminActionOutcome,
  JobAdminVersion,
  JobStatusContract,
  JobQueryRequest,
  JobQueryContract,
  JobActionRequest,
  JobRetryRequest,
  JobCancelRequest,
  JobDeadLetterRequest,
  JobAdminActionRecord,
  JobActionContract,
  JobAdminActionSink,
} from "./admin-contracts.types.js";
import { PROTOCOL_VERSION } from "@relkit/contracts";

export type {
  JobAdminMode,
  JobAdminAction,
  JobAdminActionOutcome,
  JobAdminVersion,
  JobStatusContract,
  JobQueryRequest,
  JobQueryContract,
  JobActionRequest,
  JobRetryRequest,
  JobCancelRequest,
  JobDeadLetterRequest,
  JobAdminActionRecord,
  JobActionContract,
  JobAdminActionSink,
} from "./admin-contracts.types.js";

export const JOB_ADMIN_PROTOCOL = "relkit.jobs.admin" as const;
export const JOB_ADMIN_VERSION = PROTOCOL_VERSION;
