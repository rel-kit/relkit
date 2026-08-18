import { randomUUID } from "node:crypto";
import { normalizeId } from "@zsys/contracts";
import type { JobQueue } from "./queue-utils.js";
import { JobAdminError } from "./admin-errors.js";
import {
  JOB_ADMIN_PROTOCOL,
  JOB_ADMIN_VERSION,
  type JobActionContract,
  type JobActionRequest,
  type JobAdminAction,
  type JobAdminActionRecord,
  type JobAdminActionSink,
  type JobAdminMode,
  type JobQueryContract,
  type JobQueryRequest,
  type JobStatusContract,
} from "./admin-contracts.js";
import {
  afterCursor,
  assertMode,
  assertVersion,
  cursor,
  failureFor,
  makeRecord,
  matches,
  pageLimit,
  readReason,
  recordAction,
  safeError,
  safeId,
  safeReason,
  toStatus,
  validateQuery,
  versioned,
} from "./admin-utils.js";

export * from "./admin-contracts.js";
export { JobAdminError } from "./admin-errors.js";

export interface JobAdminOptions {
  readonly mode?: JobAdminMode;
  readonly environment?: JobAdminMode;
  readonly enabled?: boolean;
  readonly now?: () => number;
  readonly createActionId?: () => string;
  readonly onAction?: JobAdminActionSink;
}

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

/** Exposes versioned local job inspection and explicitly audited mutations. */
export function createJobAdmin(queue: JobQueue, options: JobAdminOptions = {}): JobAdmin {
  const mode = options.environment ?? options.mode ?? "development";
  assertMode(mode);
  const enabled = options.enabled ?? mode !== "production";
  const records: JobAdminActionRecord[] = [];
  const status = (instanceId: string): JobStatusContract | undefined => {
    const entry = queue.get(normalizeId(instanceId));
    return entry === undefined ? undefined : toStatus(entry);
  };
  const query = (request: JobQueryRequest = {}): JobQueryContract => {
    assertVersion(request);
    validateQuery(request);
    const entries = queue
      .snapshot()
      .filter((entry) => matches(entry, request))
      .filter((entry) => afterCursor(entry, request.cursor));
    const limit = pageLimit(request.limit);
    const page = entries.slice(0, limit).map(toStatus);
    const next = entries.length > limit ? entries[limit - 1] : undefined;
    return versioned({
      items: Object.freeze(page),
      counts: queue.counts(),
      ...(next === undefined ? {} : { nextCursor: cursor(next) }),
    });
  };
  const actions = (): readonly JobAdminActionRecord[] => Object.freeze([...records]);
  const run = (action: JobAdminAction, request: string | JobActionRequest) =>
    applyAction(action, request, {
      queue,
      mode,
      enabled,
      now: options.now ?? Date.now,
      createActionId: options.createActionId ?? randomUUID,
      ...(options.onAction === undefined ? {} : { onAction: options.onAction }),
      records,
    });
  return Object.freeze({
    protocol: JOB_ADMIN_PROTOCOL,
    version: JOB_ADMIN_VERSION,
    status,
    query,
    retry: (request: string | JobActionRequest) => run("retry", request),
    cancel: (request: string | JobActionRequest) => run("cancel", request),
    deadLetter: (request: string | JobActionRequest) => run("dead-letter", request),
    actions,
  });
}

async function applyAction(
  action: JobAdminAction,
  input: string | JobActionRequest,
  options: {
    readonly queue: JobQueue;
    readonly mode: JobAdminMode;
    readonly enabled: boolean;
    readonly now: () => number;
    readonly createActionId: () => string;
    readonly onAction?: JobAdminActionSink;
    readonly records: JobAdminActionRecord[];
  },
): Promise<JobActionContract> {
  const request = typeof input === "string" ? { instanceId: input } : input;
  const instanceId = safeId(request?.instanceId);
  const actionId = safeId(options.createActionId()) ?? "invalid-action";
  const requestedAt = options.now();
  const before = instanceId === undefined ? undefined : options.queue.get(instanceId);
  try {
    assertVersion(request);
    const reason = readReason(request);
    if (!options.enabled || options.mode === "production")
      throw new JobAdminError(
        "ZSYS_JOB_ADMIN_MUTATION_DISABLED",
        "Local job mutations are disabled",
      );
    if (instanceId === undefined)
      throw new JobAdminError("ZSYS_JOB_ADMIN_INSTANCE_INVALID", "Job instance ID is invalid");
    if (before === undefined)
      throw new JobAdminError("ZSYS_JOB_ADMIN_NOT_FOUND", `Job ${instanceId} is unknown`);
    if (action === "retry") {
      if (before.state !== "dead-lettered")
        throw new JobAdminError(
          "ZSYS_JOB_ADMIN_STATE_INELIGIBLE",
          "Only dead-lettered jobs can be retried",
        );
    } else if (before.state === "completed" || before.state === "dead-lettered") {
      throw new JobAdminError(
        "ZSYS_JOB_ADMIN_STATE_INELIGIBLE",
        "Job state cannot be changed by this action",
      );
    }
    const after =
      action === "retry"
        ? await options.queue.adminRetry(instanceId)
        : await options.queue.adminDeadLetter(instanceId, failureFor(action));
    const record = await recordAction(
      options,
      makeRecord(
        action,
        actionId,
        instanceId,
        requestedAt,
        "applied",
        options.mode,
        before,
        after,
        undefined,
        reason,
      ),
    );
    return versioned({ action, status: toStatus(after), record });
  } catch (cause) {
    const error = safeError(cause);
    const record = await recordAction(
      options,
      makeRecord(
        action,
        actionId,
        instanceId ?? "invalid",
        requestedAt,
        "rejected",
        options.mode,
        before,
        undefined,
        error.code,
        safeReason(request),
      ),
    );
    throw Object.assign(error, { action: record });
  }
}
