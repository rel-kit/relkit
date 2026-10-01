/** Fixed stages and domain operations; descriptor IDs and paths never become metric dimensions. */
export type JobsOperation =
  | "discover"
  | "validateNames"
  | "validateRequirements"
  | "manifest"
  | "writeWorkers"
  | "taskBuildId"
  | "jobBuildId"
  | "publicFingerprint"
  | "serviceGeneration"
  | "buildManifest"
  | "taskEntry"
  | "jobEntry"
  | "validateClient"
  | "validateSchedules"
  | "validateResources"
  | "providerRequirements"
  | "replayAdvisories"
  | "resolveTask"
  | "workerPath"
  | "readWorkerFile"
  | "writeWorkerFile"
  | "routingRead"
  | "routingMerge"
  | "renderWorker"
  | "renderRouting";

/** Bounded workload dimensions; identifiers and user values cannot become labels. */
export interface JobsWorkload {
  readonly descriptors?: number;
  readonly diagnostics?: number;
  readonly tasks?: number;
  readonly jobs?: number;
  readonly workers?: number;
  readonly routingManifests?: number;
  readonly changed?: number;
  readonly bytes?: number;
  readonly files?: number;
  readonly schemaHashes?: number;
}
