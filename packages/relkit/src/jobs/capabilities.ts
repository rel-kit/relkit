import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type {
  JobsCapability,
  JobsCapabilityReport,
  JobsCapabilitySupport,
} from "./capabilities.types.js";
export type {
  JobsCapability,
  JobsCapabilityName,
  JobsCapabilityReport,
  JobsCapabilitySupport,
} from "./capabilities.types.js";
export { assertAdapterMethods, assertAdapterMethodsEffect } from "./adapter-methods.js";
/** A capability rejected by the Effect jobs boundary.
 * @example if (error instanceof JobsCapabilityFailure) console.log(error.message);
 */
export class JobsCapabilityFailure extends Schema.TaggedError<JobsCapabilityFailure>()(
  "Jobs.CapabilityFailure",
  { capability: Schema.String, reason: Schema.String },
) {}
/** Compatibility error raised by synchronous capability checks.
 * @example if (error instanceof JobsCapabilityError) console.log(error.message);
 */
export class JobsCapabilityError extends TypeError {
  readonly code = "RELKIT_JOB_CAPABILITY_UNSUPPORTED" as const;
  readonly capability: string;
  constructor(capability: string, message = `Jobs capability "${capability}" is unavailable`) {
    super(message);
    this.name = "JobsCapabilityError";
    this.capability = capability;
  }
}
/** Requires support for one jobs capability.
 * @param report - Validated provider report.
 * @param capability - Capability to require.
 * @returns An Effect that succeeds with void or fails with JobsCapabilityFailure.
 * @example Effect.runSync(assertJobsCapabilityEffect(report, "submission"));
 */
export const assertJobsCapabilityEffect = Effect.fn("Jobs.assertCapability")(
  function* (report: JobsCapabilityReport, capability: string) {
    const detailed = report.capabilities?.[capability];
    if (detailed !== undefined && detailed.support !== "native" && detailed.support !== "adapter") {
      return yield* new JobsCapabilityFailure({ capability, reason: unavailable(capability) });
    }
    if (detailed === undefined && report.features[capability] !== true) {
      return yield* new JobsCapabilityFailure({ capability, reason: unavailable(capability) });
    }
  },
  (effect) => observeJobs("capability.assert", effect),
);
/** Synchronously requires a supported jobs capability.
 * @param report - Validated provider report.
 * @param capability - Capability to require.
 * @returns Void when supported.
 * @throws JobsCapabilityError when unsupported.
 * @example assertJobsCapability(report, "submission");
 */
export function assertJobsCapability(report: JobsCapabilityReport, capability: string): void {
  const result = Effect.runSync(Effect.result(assertJobsCapabilityEffect(report, capability)));
  if (Result.isFailure(result)) throw new JobsCapabilityError(capability, result.failure.reason);
}
function unavailable(capability: string): string {
  return `Jobs capability "${capability}" is unavailable`;
}
/** Validates and freezes an untrusted provider report in Effect.
 * @param value - Provider report candidate.
 * @returns A validated report or JobsCapabilityFailure.
 * @example Effect.runSync(validateJobsCapabilityReportEffect(candidate));
 */
export const validateJobsCapabilityReportEffect = Effect.fn("Jobs.validateCapabilityReport")(
  (value: unknown) =>
    Effect.try({
      try: () => validateReport(value),
      catch: (error) => {
        if (error instanceof JobsCapabilityError)
          return new JobsCapabilityFailure({ capability: error.capability, reason: error.message });
        throw error;
      },
    }),
  (effect) => observeJobs("capability.validateReport", effect),
);
/** Synchronously validates and freezes a provider report.
 * @param value - Provider report candidate.
 * @returns A validated report.
 * @throws JobsCapabilityError when invalid.
 * @example validateJobsCapabilityReport(candidate);
 */
export function validateJobsCapabilityReport(value: unknown): JobsCapabilityReport {
  const result = Effect.runSync(Effect.result(validateJobsCapabilityReportEffect(value)));
  if (Result.isFailure(result))
    throw new JobsCapabilityError(result.failure.capability, result.failure.reason);
  return result.success;
}
function validateReport(value: unknown): JobsCapabilityReport {
  if (!isRecord(value) || typeof value.service !== "string" || value.service.trim() === "") {
    throw new JobsCapabilityError("report", "Jobs adapter capability report is invalid");
  }
  if (value.protocolVersion !== undefined && value.protocolVersion !== 1) {
    throw new JobsCapabilityError("report", "Unsupported jobs capability protocol");
  }
  if (
    !isRecord(value.features) ||
    Object.values(value.features).some((entry) => typeof entry !== "boolean")
  ) {
    throw new JobsCapabilityError("report", "Jobs adapter capability features are invalid");
  }
  return Object.freeze({
    service: value.service,
    ...(typeof value.provider === "string" ? { provider: value.provider } : {}),
    ...(typeof value.adapterId === "string" ? { adapterId: value.adapterId } : {}),
    ...(value.protocolVersion === undefined ? {} : { protocolVersion: 1 as const }),
    features: Object.freeze({ ...value.features }) as Readonly<Record<string, boolean>>,
    ...(value.capabilities === undefined
      ? {}
      : { capabilities: copyCapabilities(value.capabilities) }),
    ...(value.limits === undefined ? {} : { limits: copyLimits(value.limits) }),
  });
}
function copyCapabilities(value: unknown): Readonly<Record<string, JobsCapability>> {
  if (!isRecord(value))
    throw new JobsCapabilityError("report", "Jobs capability details are invalid");
  const result: Record<string, JobsCapability> = {};
  for (const [name, candidate] of Object.entries(value)) {
    if (!isRecord(candidate) || !isSupport(candidate.support)) {
      throw new JobsCapabilityError("report", `Jobs capability "${name}" is invalid`);
    }
    if (candidate.constraints !== undefined && !isRecord(candidate.constraints)) {
      throw new JobsCapabilityError("report", `Jobs capability "${name}" constraints are invalid`);
    }
    if (
      candidate.evidence !== undefined &&
      (!Array.isArray(candidate.evidence) ||
        candidate.evidence.some((entry) => typeof entry !== "string"))
    ) {
      throw new JobsCapabilityError("report", `Jobs capability "${name}" evidence is invalid`);
    }
    result[name] = Object.freeze({
      support: candidate.support,
      ...(candidate.constraints === undefined
        ? {}
        : { constraints: Object.freeze({ ...candidate.constraints }) }),
      ...(candidate.evidence === undefined
        ? {}
        : { evidence: Object.freeze([...candidate.evidence]) }),
    });
  }
  return Object.freeze(result);
}
function copyLimits(value: unknown): Readonly<Record<string, number>> {
  if (!isRecord(value))
    throw new JobsCapabilityError("report", "Jobs capability limits are invalid");
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
  return (
    value === "native" || value === "adapter" || value === "unsupported" || value === "unverified"
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
