import { Schema } from "effect";
import {
  JOBS_MANIFEST_PROTOCOL,
  JOBS_MANIFEST_VERSION,
  JOBS_PROTOCOL_VERSION,
} from "@relkit/contracts/jobs";

/** Data-only executable task metadata; callback bodies never cross this boundary. */
export const JobsManifestTask = Schema.Struct({
  id: Schema.String,
  graphId: Schema.String,
  version: Schema.String,
  execution: Schema.String,
  buildId: Schema.String,
  schemaHashes: Schema.Json,
  policy: Schema.Json,
  dependencies: Schema.Json,
  publishes: Schema.Json,
  resources: Schema.Json,
});

/** Task binding metadata with payload-free client and schedule projections. */
export const JobsManifestJob = Schema.Struct({
  id: Schema.String,
  graphId: Schema.String,
  name: Schema.String,
  taskId: Schema.String,
  taskVersion: Schema.String,
  buildId: Schema.String,
  profile: Schema.String,
  serviceGeneration: Schema.String,
  implicit: Schema.Boolean,
  default: Schema.Boolean,
  client: Schema.Json,
  policy: Schema.Json,
  schedules: Schema.Json,
  compatibility: Schema.Json,
});

/** Immutable worker identity projected from one accepted job binding. */
export const JobsManifestWorkerEntry = Schema.Struct({
  jobId: Schema.String,
  taskId: Schema.String,
  buildId: Schema.String,
  serviceGeneration: Schema.String,
  path: Schema.String,
});

/** Provider generation associated with an application profile. */
export const ServiceGeneration = Schema.Struct({
  profile: Schema.String,
  generation: Schema.String,
});

/** Versioned compiler-owned jobs manifest, containing only portable JSON data. */
export const JobsManifest = Schema.Struct({
  protocol: Schema.Literal(JOBS_MANIFEST_PROTOCOL),
  version: Schema.Literal(JOBS_MANIFEST_VERSION),
  app: Schema.String,
  environment: Schema.String,
  graphHash: Schema.String,
  publicFingerprint: Schema.String,
  jobsProtocolVersion: Schema.Literal(JOBS_PROTOCOL_VERSION),
  tasks: Schema.Array(JobsManifestTask),
  jobs: Schema.Array(JobsManifestJob),
  nameToId: Schema.Record(Schema.String, Schema.String),
  serviceGenerations: Schema.Array(ServiceGeneration),
  workerEntries: Schema.Array(JobsManifestWorkerEntry),
  schemaHashes: Schema.Record(Schema.String, Schema.String),
  policies: Schema.Record(Schema.String, Schema.Json),
  schedules: Schema.Array(Schema.Json),
  recipes: Schema.Array(Schema.Json),
  compatibilityReportHashes: Schema.Array(Schema.String),
});
