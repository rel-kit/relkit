import { canonicalJson } from "@relkit/contracts";
import { assertDeploymentPlanVersion, type DeploymentPlan } from "@relkit/deploy";

export interface ResourceEntry {
  readonly kind: string;
  readonly logicalName: string;
  readonly value: object;
}

export function snapshotPlan(plan: DeploymentPlan): DeploymentPlan {
  assertDeploymentPlanVersion(plan);
  const value = JSON.parse(canonicalJson(plan)) as DeploymentPlan;
  return {
    ...value,
    application: {
      ...value.application,
      environmentNames: [...value.application.environmentNames].sort(),
    },
    http: {
      ...value.http,
      configurationNames: [...value.http.configurationNames].sort(),
      routes: [...value.http.routes].sort((left, right) => left.id.localeCompare(right.id)),
    },
    jobs: sortEntries(value.jobs),
    schedules: sortEntries(value.schedules),
    events: sortEntries(value.events),
    eventTriggers: sortEntries(value.eventTriggers),
    buckets: sortEntries(value.buckets),
    caches: sortEntries(value.caches),
    iam: {
      serviceRole: {
        ...value.iam.serviceRole,
        statements: [...value.iam.serviceRole.statements].sort(
          (left, right) =>
            left.capability.localeCompare(right.capability) ||
            left.actions.join(",").localeCompare(right.actions.join(",")),
        ),
      },
      perFunction: [...value.iam.perFunction].sort(
        (left, right) =>
          left.functionId.localeCompare(right.functionId) ||
          left.capability.localeCompare(right.capability) ||
          left.resourceId.localeCompare(right.resourceId),
      ),
    },
  };
}

export function resourceEntries(plan: DeploymentPlan): readonly ResourceEntry[] {
  return [
    { kind: "http", logicalName: plan.http.logicalName, value: plan.http },
    ...plan.jobs.map((value) => ({ kind: "job", logicalName: value.logicalName, value })),
    ...plan.schedules.map((value) => ({ kind: "schedule", logicalName: value.logicalName, value })),
    ...plan.events.map((value) => ({ kind: "event", logicalName: value.logicalName, value })),
    ...plan.eventTriggers.map((value) => ({
      kind: "event-trigger",
      logicalName: value.logicalName,
      value,
    })),
    ...plan.buckets.map((value) => ({ kind: "bucket", logicalName: value.logicalName, value })),
    ...plan.caches.map((value) => ({ kind: "cache", logicalName: value.logicalName, value })),
  ];
}

export function requiredTags(plan: DeploymentPlan, stackName: string): Record<string, string> {
  return {
    app: plan.application.id,
    stack: stackName,
    graphHash: plan.graphHash,
    "managed-by": "relkit",
  };
}

export function entryTags(value: object, tags: Record<string, string>): Record<string, string> {
  const existing = (value as { readonly tags?: unknown }).tags;
  return {
    ...(existing !== null && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, string>)
      : {}),
    ...tags,
  };
}

export function scopedName(stackName: string, logicalName: string): string {
  return identity(`${stackName}-${logicalName}`, "resourceName");
}

export function identity(value: string, label: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/(?<!-)-+$/, "");
  if (normalized === "") throw new TypeError(`Pulumi ${label} must not be empty.`);
  return normalized;
}

function sortEntries<T extends { readonly id: string; readonly logicalName: string }>(
  values: readonly T[],
): T[] {
  return [...values].sort(
    (left, right) =>
      left.logicalName.localeCompare(right.logicalName) || left.id.localeCompare(right.id),
  );
}
