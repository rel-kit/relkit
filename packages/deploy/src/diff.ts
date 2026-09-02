import { canonicalJson, deepFreeze } from "@relkit/contracts";
import { assertDeploymentPlanVersion, type DeploymentPlan } from "./plan.js";
import {
  changedFields,
  isSecuritySensitive,
  keys,
  resources,
  type Resource,
} from "./diff-utils.js";

export const DEPLOYMENT_OPERATIONS = ["create", "update", "delete", "replace"] as const;
export type DeploymentOperation = (typeof DEPLOYMENT_OPERATIONS)[number];

export const DEPLOYMENT_RISKS = ["low", "medium", "high", "critical"] as const;
export type DeploymentRisk = (typeof DEPLOYMENT_RISKS)[number];

export type ConfirmationReason = "destructive" | "security-sensitive";
export type ConfirmationClassification =
  "none" | "destructive" | "security-sensitive" | "destructive-and-security-sensitive";

export interface DeploymentResourceChange {
  /** The descriptor or logical resource ID; it never contains a source path. */
  readonly id: string;
  /** Kind-qualified ID used to order and match resources without array positions. */
  readonly stableId: string;
  readonly kind: string;
  readonly logicalName: string;
  readonly operation: DeploymentOperation;
  readonly risk: DeploymentRisk;
  readonly securitySensitive: boolean;
  readonly confirmation: "none" | "required";
  readonly confirmationClassification: ConfirmationClassification;
  readonly confirmationReasons: readonly ConfirmationReason[];
  readonly fields: readonly string[];
}

export interface DeploymentRiskSummary {
  readonly create: number;
  readonly update: number;
  readonly delete: number;
  readonly replace: number;
  readonly securitySensitive: number;
  readonly destructive: number;
  readonly requiresConfirmation: boolean;
  readonly confirmation: "none" | "required";
  readonly highestRisk?: DeploymentRisk;
}

export interface DeploymentDiff {
  readonly changes: readonly DeploymentResourceChange[];
  readonly summary: DeploymentRiskSummary;
  readonly hasDestructiveChanges: boolean;
  readonly requiresConfirmation: boolean;
}

/** Compares deployment resources; this is intentionally separate from graph contract diffing. */
export function diffDeploymentPlans(before: DeploymentPlan, after: DeploymentPlan): DeploymentDiff {
  assertDeploymentPlanVersion(before);
  assertDeploymentPlanVersion(after);
  const left = resources(before);
  const right = resources(after);
  const beforeById = new Map(left.map((resource) => [resource.stableId, resource]));
  const afterById = new Map(right.map((resource) => [resource.stableId, resource]));
  const changes = [...new Set([...beforeById.keys(), ...afterById.keys()])]
    .sort()
    .flatMap((stableId) => change(beforeById.get(stableId), afterById.get(stableId)));
  const summary = summarizeDeploymentChanges(changes);
  return deepFreeze({
    changes,
    summary,
    hasDestructiveChanges: summary.destructive > 0,
    requiresConfirmation: summary.requiresConfirmation,
  });
}

export const diffDeploymentPlan = diffDeploymentPlans;
export const diffDeployment = diffDeploymentPlans;

/** Aggregates stable deployment changes for confirmation and human/machine reports. */
export function summarizeDeploymentChanges(
  changes: readonly DeploymentResourceChange[],
): DeploymentRiskSummary {
  const counts = { create: 0, update: 0, delete: 0, replace: 0 };
  for (const change of changes) counts[change.operation] += 1;
  const securitySensitive = changes.filter((change) => change.securitySensitive).length;
  const destructive = changes.filter((change) =>
    change.confirmationReasons.includes("destructive"),
  ).length;
  const requiresConfirmation = changes.some((change) => change.confirmation === "required");
  const highestRisk = changes.reduce<DeploymentRisk | undefined>(
    (current, change) =>
      current === undefined || rank(change.risk) > rank(current) ? change.risk : current,
    undefined,
  );
  return deepFreeze({
    ...counts,
    securitySensitive,
    destructive,
    requiresConfirmation,
    confirmation: requiresConfirmation ? "required" : "none",
    ...(highestRisk === undefined ? {} : { highestRisk }),
  });
}

function change(
  before: Resource | undefined,
  after: Resource | undefined,
): DeploymentResourceChange[] {
  if (before === undefined && after === undefined) return [];
  const resource = after ?? before!;
  if (
    before !== undefined &&
    after !== undefined &&
    canonicalJson(before.value) === canonicalJson(after.value)
  )
    return [];
  const operation: DeploymentOperation =
    before === undefined
      ? "create"
      : after === undefined
        ? "delete"
        : before.replacementKey !== after.replacementKey
          ? "replace"
          : "update";
  const fields =
    before === undefined
      ? keys(resource.value)
      : after === undefined
        ? keys(resource.value)
        : changedFields(before.value, after.value);
  const securitySensitive = isSecuritySensitive(
    resource.kind,
    operation,
    fields,
    before?.value,
    after?.value,
  );
  const reasons: ConfirmationReason[] = [];
  const destructive =
    (operation === "delete" || operation === "replace") &&
    resource.kind !== "connected-binding" &&
    resource.kind !== "access-operation";
  if (destructive) reasons.push("destructive");
  if (securitySensitive) reasons.push("security-sensitive");
  const confirmationClassification = reasons.includes("destructive")
    ? reasons.includes("security-sensitive")
      ? "destructive-and-security-sensitive"
      : "destructive"
    : reasons.includes("security-sensitive")
      ? "security-sensitive"
      : "none";
  return [
    {
      id: resource.id,
      stableId: resource.stableId,
      kind: resource.kind,
      logicalName: resource.logicalName,
      operation,
      risk: risk(operation, securitySensitive, destructive),
      securitySensitive,
      confirmation: confirmationClassification === "none" ? "none" : "required",
      confirmationClassification,
      confirmationReasons: reasons,
      fields,
    },
  ];
}

function risk(
  operation: DeploymentOperation,
  securitySensitive: boolean,
  destructive: boolean,
): DeploymentRisk {
  if (destructive && operation === "replace") return "critical";
  if (destructive && operation === "delete") return securitySensitive ? "critical" : "high";
  if (securitySensitive) return "high";
  return operation === "update" ? "medium" : "low";
}

function rank(value: DeploymentRisk): number {
  return DEPLOYMENT_RISKS.indexOf(value);
}
