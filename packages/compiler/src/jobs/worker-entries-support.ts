export type RoutingEntry = {
  readonly jobId: string;
  readonly taskId: string;
  readonly buildId: string;
  readonly serviceGeneration: string;
};

export interface RoutingManifest {
  readonly protocol: "relkit.jobs-routing";
  readonly version: 1;
  readonly buildId: string;
  readonly serviceGeneration: string;
  readonly entries: readonly RoutingEntry[];
}

export function assertSegment(value: string, name: string): void {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\")
  )
    throw new TypeError(`Job worker ${name} must be one safe path segment.`);
}

export function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function isRoutingManifest(value: unknown): value is RoutingManifest {
  if (
    !isRecord(value) ||
    value.protocol !== "relkit.jobs-routing" ||
    value.version !== 1 ||
    typeof value.buildId !== "string" ||
    typeof value.serviceGeneration !== "string" ||
    !Array.isArray(value.entries)
  )
    return false;
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
