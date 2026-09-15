import type { JobsAdapterRuntime } from "./adapter.js";

export type JobsCapabilitySupport = "native" | "adapter" | "unsupported" | "unverified";

export interface JobsCapability {
  readonly support: JobsCapabilitySupport;
  readonly constraints?: Readonly<Record<string, unknown>>;
  readonly evidence?: readonly string[];
}

export interface JobsCapabilityReport {
  readonly service: string;
  readonly provider?: string;
  readonly adapterId?: string;
  readonly protocolVersion?: 1;
  readonly features: Readonly<Record<string, boolean>>;
  readonly capabilities?: Readonly<Record<string, JobsCapability>>;
  readonly limits?: Readonly<Record<string, number>>;
}

export type JobsCapabilityName =
  | "submission"
  | "read"
  | "list"
  | "observation"
  | "cancel"
  | "retry"
  | "schedules"
  | "streams";

export class JobsCapabilityError extends TypeError {
  readonly code = "RELKIT_JOB_CAPABILITY_UNSUPPORTED" as const;
  readonly capability: string;

  constructor(capability: string, message = `Jobs capability "${capability}" is unavailable`) {
    super(message);
    this.name = "JobsCapabilityError";
    this.capability = capability;
  }
}

export function assertJobsCapability(
  report: JobsCapabilityReport,
  capability: string,
): void {
  const detailed = report.capabilities?.[capability];
  if (detailed !== undefined && detailed.support !== "native" && detailed.support !== "adapter") {
    throw new JobsCapabilityError(capability);
  }
  if (detailed === undefined && report.features[capability] !== true) {
    throw new JobsCapabilityError(capability);
  }
}

export function validateJobsCapabilityReport(value: unknown): JobsCapabilityReport {
  if (!isRecord(value) || typeof value.service !== "string" || value.service.trim() === "") {
    throw new JobsCapabilityError("report", "Jobs adapter capability report is invalid");
  }
  if (value.protocolVersion !== undefined && value.protocolVersion !== 1) {
    throw new JobsCapabilityError("report", "Unsupported jobs capability protocol");
  }
  if (!isRecord(value.features) || Object.values(value.features).some((entry) => typeof entry !== "boolean")) {
    throw new JobsCapabilityError("report", "Jobs adapter capability features are invalid");
  }
  return Object.freeze({
    service: value.service,
    ...(typeof value.provider === "string" ? { provider: value.provider } : {}),
    ...(typeof value.adapterId === "string" ? { adapterId: value.adapterId } : {}),
    ...(value.protocolVersion === undefined ? {} : { protocolVersion: 1 as const }),
    features: Object.freeze({ ...value.features }) as Readonly<Record<string, boolean>>,
    ...(value.capabilities === undefined ? {} : { capabilities: copyCapabilities(value.capabilities) }),
    ...(value.limits === undefined ? {} : { limits: copyLimits(value.limits) }),
  });
}

export function assertAdapterMethods(adapter: JobsAdapterRuntime): void {
  const required: readonly (keyof JobsAdapterRuntime)[] = [
    "submit",
    "get",
    "list",
    "observe",
    "cancel",
    "close",
  ];
  for (const method of required) {
    if (typeof adapter[method] !== "function") {
      throw new JobsCapabilityError(String(method), `Jobs adapter method "${String(method)}" is required`);
    }
  }
  if (adapter.capabilities.features.schedules === true && adapter.schedules === undefined) {
    throw new JobsCapabilityError("schedules", "Jobs adapter advertises schedules without schedule methods");
  }
  if (adapter.capabilities.features.streams === true && adapter.streams === undefined) {
    throw new JobsCapabilityError("streams", "Jobs adapter advertises streams without stream methods");
  }
  if (adapter.capabilities.features.retry === true && typeof adapter.retry !== "function") {
    throw new JobsCapabilityError("retry", "Jobs adapter advertises retry without a retry method");
  }
}

function copyCapabilities(value: unknown): Readonly<Record<string, JobsCapability>> {
  if (!isRecord(value)) throw new JobsCapabilityError("report", "Jobs capability details are invalid");
  const result: Record<string, JobsCapability> = {};
  for (const [name, candidate] of Object.entries(value)) {
    if (!isRecord(candidate) || !isSupport(candidate.support)) {
      throw new JobsCapabilityError("report", `Jobs capability "${name}" is invalid`);
    }
    if (candidate.constraints !== undefined && !isRecord(candidate.constraints)) {
      throw new JobsCapabilityError("report", `Jobs capability "${name}" constraints are invalid`);
    }
    if (candidate.evidence !== undefined &&
      (!Array.isArray(candidate.evidence) || candidate.evidence.some((entry) => typeof entry !== "string"))) {
      throw new JobsCapabilityError("report", `Jobs capability "${name}" evidence is invalid`);
    }
    result[name] = Object.freeze({
      support: candidate.support,
      ...(candidate.constraints === undefined ? {} : { constraints: Object.freeze({ ...candidate.constraints }) }),
      ...(candidate.evidence === undefined ? {} : { evidence: Object.freeze([...candidate.evidence]) }),
    });
  }
  return Object.freeze(result);
}

function copyLimits(value: unknown): Readonly<Record<string, number>> {
  if (!isRecord(value)) throw new JobsCapabilityError("report", "Jobs capability limits are invalid");
  const result: Record<string, number> = {};
  for (const [name, candidate] of Object.entries(value)) {
    if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate < 1) {
      throw new JobsCapabilityError("report", `Jobs capability limit "${name}" is invalid`);
    }
    result[name] = candidate;
  }
  return Object.freeze(result);
}

function isSupport(value: unknown): value is JobsCapabilitySupport {
  return value === "native" || value === "adapter" || value === "unsupported" || value === "unverified";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
