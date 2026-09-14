import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import type { JobsManifestWorkerEntry } from "./manifest.js";
import { writeIfChanged, type ArtifactWriteResult } from "../generated-artifacts.js";

export interface JobWorkerWriteOptions {
  readonly buildDirectory: string;
}

export interface JobWorkerWriteReport {
  readonly workers: readonly ArtifactWriteResult[];
  readonly routingManifests: readonly ArtifactWriteResult[];
  readonly changed: boolean;
}

export class JobWorkerConflictError extends Error {
  readonly code = "RELKIT_JOB_WORKER_IMMUTABLE_CONFLICT" as const;

  constructor(readonly path: string) {
    super(`Immutable job worker entry already exists with different content: ${path}`);
    this.name = "JobWorkerConflictError";
  }
}

type RoutingEntry = Omit<JobsManifestWorkerEntry, "path">;

interface RoutingManifest {
  readonly protocol: "relkit.jobs-routing";
  readonly version: 1;
  readonly buildId: string;
  readonly serviceGeneration: string;
  readonly entries: readonly RoutingEntry[];
}

/** Returns the immutable worker path for a compiled job build and service generation. */
export function jobWorkerPath(buildDirectory: string, entry: Pick<JobsManifestWorkerEntry, "buildId" | "serviceGeneration">): string {
  assertSegment(entry.buildId, "buildId");
  assertSegment(entry.serviceGeneration, "serviceGeneration");
  return join(buildDirectory, "jobs", entry.buildId, entry.serviceGeneration, "worker.js");
}

/** Writes worker metadata and historical routing manifests after conflict preflight. */
export async function writeJobWorkerEntries(
  entries: readonly JobsManifestWorkerEntry[],
  options: JobWorkerWriteOptions,
): Promise<JobWorkerWriteReport> {
  const groups = new Map<string, JobsManifestWorkerEntry[]>();
  for (const entry of entries) {
    const path = jobWorkerPath(options.buildDirectory, entry);
    const group = groups.get(path) ?? [];
    group.push(entry);
    groups.set(path, group);
  }
  const pending = await Promise.all(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(async ([path, group]) => {
        const sorted = [...group].sort((left, right) => left.jobId.localeCompare(right.jobId));
        const first = sorted[0]!;
        const routing = join(dirname(path), "routing.manifest.json");
        const existingRouting = await readRoutingManifest(routing);
        const routingEntries = mergeRoutingEntries(existingRouting, sorted, routing);
        return {
          path,
          content: renderWorker(first, sorted),
          routing,
          routingContent: renderRouting(first, routingEntries),
        };
      }),
  );
  await assertImmutable(pending.map((entry) => [entry.path, entry.content] as const));
  const workers = await Promise.all(pending.map((entry) => writeIfChanged(entry.path, entry.content)));
  const routingManifests = await Promise.all(pending.map((entry) => writeIfChanged(entry.routing, entry.routingContent)));
  return Object.freeze({
    workers: Object.freeze(workers),
    routingManifests: Object.freeze(routingManifests),
    changed: workers.some((entry) => entry.changed) || routingManifests.some((entry) => entry.changed),
  });
}

export const writeWorkerEntries = writeJobWorkerEntries;

function renderWorker(
  first: JobsManifestWorkerEntry,
  entries: readonly JobsManifestWorkerEntry[],
): string {
  return `${canonicalJson({
    kind: "relkit-job-worker",
    version: 1,
    buildId: first.buildId,
    serviceGeneration: first.serviceGeneration,
    taskIds: [...new Set(entries.map((entry) => entry.taskId))].sort(),
  })}\n`;
}

function renderRouting(
  first: JobsManifestWorkerEntry,
  entries: readonly RoutingEntry[],
): string {
  return `${canonicalJson({
    protocol: "relkit.jobs-routing",
    version: 1,
    buildId: first.buildId,
    serviceGeneration: first.serviceGeneration,
    entries: entries.map(({ jobId, taskId, buildId, serviceGeneration }) => ({ jobId, taskId, buildId, serviceGeneration })),
  })}\n`;
}

async function readRoutingManifest(path: string): Promise<RoutingManifest | undefined> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  try {
    const value: unknown = JSON.parse(source);
    if (!isRoutingManifest(value)) throw new TypeError("Invalid routing manifest");
    return value;
  } catch {
    throw new JobWorkerConflictError(path);
  }
}

function mergeRoutingEntries(
  existing: RoutingManifest | undefined,
  incoming: readonly JobsManifestWorkerEntry[],
  path: string,
): readonly RoutingEntry[] {
  const first = incoming[0]!;
  if (
    existing !== undefined &&
    (existing.buildId !== first.buildId || existing.serviceGeneration !== first.serviceGeneration)
  ) {
    throw new JobWorkerConflictError(path);
  }
  const entries = new Map(existing?.entries.map((entry) => [entry.jobId, entry]) ?? []);
  for (const entry of incoming) {
    const next = routingEntry(entry);
    const previous = entries.get(next.jobId);
    if (previous !== undefined && canonicalJson(previous) !== canonicalJson(next))
      throw new JobWorkerConflictError(path);
    entries.set(next.jobId, next);
  }
  return [...entries.values()].sort((left, right) => left.jobId.localeCompare(right.jobId));
}

function routingEntry(entry: JobsManifestWorkerEntry): RoutingEntry {
  const { jobId, taskId, buildId, serviceGeneration } = entry;
  return { jobId, taskId, buildId, serviceGeneration };
}

async function assertImmutable(entries: readonly (readonly [string, string])[]): Promise<void> {
  for (const [path, content] of entries) {
    let existing: string | undefined;
    try {
      existing = await readFile(path, "utf8");
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    if (existing !== undefined && existing !== content) throw new JobWorkerConflictError(path);
  }
}

function assertSegment(value: string, name: string): void {
  if (value.length === 0 || value === "." || value === ".." || value.includes("/") || value.includes("\\"))
    throw new TypeError(`Job worker ${name} must be one safe path segment.`);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isRoutingManifest(value: unknown): value is RoutingManifest {
  if (
    !isRecord(value) ||
    value.protocol !== "relkit.jobs-routing" ||
    value.version !== 1 ||
    typeof value.buildId !== "string" ||
    typeof value.serviceGeneration !== "string" ||
    !Array.isArray(value.entries)
  ) {
    return false;
  }
  return value.entries.every(isRoutingEntry);
}

function isRoutingEntry(value: unknown): value is RoutingEntry {
  return (
    isRecord(value) &&
    typeof value.jobId === "string" &&
    typeof value.taskId === "string" &&
    typeof value.buildId === "string" &&
    typeof value.serviceGeneration === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
