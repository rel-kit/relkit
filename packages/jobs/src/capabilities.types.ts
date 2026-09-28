/** Level of support reported by a jobs provider. */
export type JobsCapabilitySupport = "native" | "adapter" | "unsupported" | "unverified";
/** Evidence and constraints for one provider capability. */
export interface JobsCapability {
  readonly support: JobsCapabilitySupport;
  readonly constraints?: Readonly<Record<string, unknown>>;
  readonly evidence?: readonly string[];
}
/** Provider capabilities validated at the jobs boundary. */
export interface JobsCapabilityReport {
  readonly service: string;
  readonly provider?: string;
  readonly adapterId?: string;
  readonly protocolVersion?: 1;
  readonly features: Readonly<Record<string, boolean>>;
  readonly capabilities?: Readonly<Record<string, JobsCapability>>;
  readonly limits?: Readonly<Record<string, number>>;
}
/** Standard jobs capability names. */
export type JobsCapabilityName =
  "submission" | "read" | "list" | "observation" | "cancel" | "retry" | "schedules" | "streams";
