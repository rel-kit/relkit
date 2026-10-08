import { CliJobs, jobsLiveLayer } from "../services/jobs.service.js";
import { runCliEffect } from "../cli-runtime.js";
import type { JobsManifestView } from "./jobs.types.js";
export type { JobsManifestView } from "./jobs.types.js";

/**
 * Reads the optional compiled jobs manifest at its established Promise edge.
 * @param root - Existing explicit project root.
 * @returns Accepted projection or the existing undefined fallback.
 */
export function readJobsManifest(root: string): Promise<JobsManifestView | undefined> {
  return runCliEffect(
    CliJobs.use((jobs) => jobs.manifest(root)),
    jobsLiveLayer(),
  );
}
