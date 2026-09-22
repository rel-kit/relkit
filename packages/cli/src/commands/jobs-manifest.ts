import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface JobsManifestView {
  readonly jobs?: readonly unknown[];
  readonly recipes?: readonly unknown[];
  readonly serviceGenerations?: readonly unknown[];
  readonly publicFingerprint?: string;
  readonly jobsProtocolVersion?: number;
}

export async function readJobsManifest(root: string): Promise<JobsManifestView | undefined> {
  try {
    return JSON.parse(
      await readFile(resolve(root, ".relkit/generated/jobs.manifest.json"), "utf8"),
    ) as JobsManifestView;
  } catch {
    return undefined;
  }
}
