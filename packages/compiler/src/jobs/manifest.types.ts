import type { Schema } from "effect";
import type { Diagnostic } from "@relkit/diagnostics";
import type {
  NormalizedDescriptor,
  NormalizedGraph,
  NormalizationWork,
} from "../normalize-types.js";
import type * as Models from "./manifest-schema.js";

/** Decoded JobsManifestTask contract, derived from the runtime schema. */
export interface JobsManifestTask extends Schema.Schema.Type<typeof Models.JobsManifestTask> {}

/** Decoded JobsManifestJob contract, derived from the runtime schema. */
export interface JobsManifestJob extends Schema.Schema.Type<typeof Models.JobsManifestJob> {}

/** Decoded JobsManifestWorkerEntry contract, derived from the runtime schema. */
export interface JobsManifestWorkerEntry extends Schema.Schema.Type<
  typeof Models.JobsManifestWorkerEntry
> {}

/** Decoded JobsManifest contract, derived from the runtime schema. */
export interface JobsManifest extends Schema.Schema.Type<typeof Models.JobsManifest> {}

/** Trusted normalized compiler inputs; optional work preserves its authoritative indexes. */
export interface JobsManifestInput {
  readonly graph?: NormalizedGraph;
  readonly graphHash: string;
  readonly descriptors: readonly NormalizedDescriptor[];
  readonly diagnostics?: readonly Diagnostic[];
  readonly appId?: string;
  readonly environment?: string;
  readonly projectRoot?: string;
  readonly work?: NormalizationWork;
}

/** Serialized manifest result; activation is denied when prerequisite diagnostics fail. */
export interface GeneratedJobsManifest {
  readonly source: string;
  readonly value?: JobsManifest;
  readonly diagnostics: readonly Diagnostic[];
  readonly activatable: boolean;
}

/** Distinct provider profile and service generation used by manifest routing. */
export interface ServiceGeneration extends Schema.Schema.Type<typeof Models.ServiceGeneration> {}
import type { Effect } from "effect";
import type { GraphCompilationFailure } from "../normalize-graph.types.js";
import type { buildManifestEffect } from "./manifest-build.js";

/** Graph, JSON, or schema issues produced while constructing a jobs manifest. */
export type JobsManifestGenerationFailure =
  GraphCompilationFailure | Effect.Error<ReturnType<typeof buildManifestEffect>>;
