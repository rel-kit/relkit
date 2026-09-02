import { canonicalJson, type JsonValue } from "@relkit/contracts";
import type { DeploymentOperation } from "./diff.js";
import type { DeploymentPlan } from "./plan.js";

export interface Resource {
  readonly id: string;
  readonly stableId: string;
  readonly kind: string;
  readonly logicalName: string;
  readonly replacementKey: string;
  readonly value: JsonValue;
}

export function resources(plan: DeploymentPlan): readonly Resource[] {
  const result: Resource[] = [
    integration("deployment-engine", "engine", plan.engine),
    integration("application-host", "host", plan.host),
    ...plan.connectedBindings.map((value) =>
      resource("connected-binding", value.bindingId, value.bindingId, value, adapterKey(value)),
    ),
    ...plan.infrastructureOperations.map((value) =>
      resource(
        "infrastructure-operation",
        value.id,
        value.bindingId,
        value,
        `${integrationKey(value.integration)}\0${adapterKey(value)}`,
      ),
    ),
    ...plan.accessOperations.map((value) =>
      resource(
        "access-operation",
        value.id,
        value.bindingId,
        value,
        integrationKey(value.integration),
      ),
    ),
    resource("application", plan.application.id, plan.application.id, {
      ...plan.application,
      contractVersion: plan.contractVersion,
      graphHash: plan.graphHash,
    }),
    resource("http", plan.http.logicalName, plan.http.logicalName, plan.http),
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

function resource(
  kind: string,
  id: string,
  logicalName: string,
  value: unknown,
  replacementKey = logicalName,
): Resource {
  return {
    id,
    stableId: `${kind}:${id}`,
    kind,
    logicalName,
    replacementKey,
    value: value as JsonValue,
  };
}

function integration(
  kind: string,
  id: string,
  value: DeploymentPlan["engine"] | DeploymentPlan["host"],
): Resource {
  return resource(kind, id, value.integrationId, value, integrationKey(value));
}

function integrationKey(value: { readonly integrationId: string; readonly protocolVersion: 1 }) {
  return `${value.integrationId}\0${value.protocolVersion}`;
}

function adapterKey(value: {
  readonly adapter: {
    readonly integrationId: string;
    readonly adapterId: string;
    readonly protocolVersion: 1;
  };
}) {
  return `${value.adapter.integrationId}\0${value.adapter.adapterId}\0${value.adapter.protocolVersion}`;
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
  if (
    changed.some((field) =>
      /configurationNames|environmentNames|provider|profile|adapter|namedValues|integration|connection/i.test(
        field,
      ),
    )
  )
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
