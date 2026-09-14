export const JOBS_PROTOCOL = "relkit.jobs" as const;
export const JOBS_PROTOCOL_VERSION = 1 as const;
export const JOBS_MANIFEST_PROTOCOL = "relkit.jobs-manifest" as const;
export const JOBS_MANIFEST_VERSION = 1 as const;
export const JOB_NAME_MAX_LENGTH = 64 as const;

export * from "./jobs-contracts.js";
