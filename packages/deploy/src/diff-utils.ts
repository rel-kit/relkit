import { canonicalJson, type JsonValue } from "@zsys/contracts";
import type { DeploymentOperation } from "./diff.js";
import type { DeploymentPlan } from "./plan.js";

export interface Resource {
  readonly id: string;
  readonly stableId: string;
  readonly kind: string;
  readonly logicalName: string;
  readonly value: JsonValue;
}

export function resources(plan: DeploymentPlan): readonly Resource[] {
  const result: Resource[] = [
    resource("application", plan.application.id, plan.application.id, {
      ...plan.application,
      contractVersion: plan.contractVersion,
      graphHash: plan.graphHash,
    }),
    resource("http", plan.http.logicalName, plan.http.logicalName, plan.http),
    ...(plan.observability === undefined
      ? []
      : [
          resource(
            "observability",
            plan.observability.logicalName,
            plan.observability.logicalName,
            plan.observability,
          ),
        ]),
    ...entries("job", plan.jobs),
    ...entries("schedule", plan.schedules),
    ...entries("event", plan.events),
    ...entries("event-trigger", plan.eventTriggers),
    ...entries("bucket", plan.buckets),
    ...entries("cache", plan.caches),
  ];
  return result.sort((left, right) => left.stableId.localeCompare(right.stableId));
}

function entries(
  kind: string,
  values: readonly { readonly id: string; readonly logicalName: string }[],
): Resource[] {
  return values.map((value) => resource(kind, value.id, value.logicalName, value));
}

function resource(kind: string, id: string, logicalName: string, value: unknown): Resource {
  return {
    id,
    stableId: `${kind}:${id}`,
    kind,
    logicalName,
    value: value as JsonValue,
  };
}

export function changedFields(before: JsonValue, after: JsonValue): readonly string[] {
  if (!isRecord(before) || !isRecord(after)) return ["value"];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => canonicalJson(before[key]) !== canonicalJson(after[key]))
    .sort();
}

export function keys(value: JsonValue): readonly string[] {
  return isRecord(value) ? Object.keys(value).sort() : ["value"];
}

export function isSecuritySensitive(
  kind: string,
  operation: DeploymentOperation,
  fields: readonly string[],
  before: JsonValue | undefined,
  after: JsonValue | undefined,
): boolean {
  const changed = operation === "create" || operation === "delete" ? [] : fields;
  if (changed.some((field) => /configurationNames|environmentNames|provider|profile/i.test(field)))
    return true;
  if (changed.includes("visibility") && [before, after].some((value) => hasPublicVisibility(value)))
    return true;
  if (changed.includes("metadata") && [before, after].some((value) => hasSecurityMetadata(value)))
    return true;
  if (operation === "create" || operation === "delete")
    return [before, after].some(
      (value) => hasSecurityMetadata(value) || hasPublicVisibility(value),
    );
  return false;
}

function hasPublicVisibility(value: JsonValue | undefined): boolean {
  return isRecord(value) && value.visibility === "public";
}

function hasSecurityMetadata(value: JsonValue | undefined): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    /iam|permission|policy|credential|secret|token|role|security/i.test(key)
      ? true
      : hasSecurityMetadata(child),
  );
}

function isRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
