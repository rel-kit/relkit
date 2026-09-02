import { canonicalJson } from "@relkit/contracts";
import type { DeploymentPlan } from "./plan.js";

const ROOT_KEYS = [
  "contractVersion",
  "graphHash",
  "application",
  "engine",
  "host",
  "connectedBindings",
  "infrastructureOperations",
  "accessOperations",
  "http",
  "jobs",
  "schedules",
  "events",
  "eventTriggers",
  "buckets",
  "caches",
  "iam",
] as const;
export class DeploymentPlanValidationError extends TypeError {
  readonly code = "RELKIT_DEPLOYMENT_PLAN_INVALID" as const;

  constructor(path: string, reason: string) {
    super(`Deployment plan ${path} ${reason}; regenerate with \`relkit deploy preview\`.`);
    this.name = "DeploymentPlanValidationError";
  }
}
export function assertDeploymentPlanShape(value: unknown): asserts value is DeploymentPlan {
  try {
    canonicalJson(value);
  } catch {
    invalid("root", "is not JSON-safe");
  }
  const plan = object(value, "root");
  exact(plan, ROOT_KEYS, "root");
  text(plan.graphHash, "graphHash");
  const application = object(plan.application, "application");
  text(application.id, "application.id");
  object(application.image, "application.image");
  strings(application.environmentNames, "application.environmentNames");
  integration(plan.engine, "engine", "engine");
  integration(plan.host, "host", "host");
  for (const key of ["http", "iam"] as const) object(plan[key], key);
  for (const key of ["jobs", "schedules", "events", "eventTriggers", "buckets", "caches"] as const)
    list(plan[key], key);

  const connected = list(plan.connectedBindings, "connectedBindings");
  const infrastructure = list(plan.infrastructureOperations, "infrastructureOperations");
  const access = list(plan.accessOperations, "accessOperations");
  connected.forEach((item, index) =>
    binding(item, `connectedBindings[${index}]`, "connected-binding"),
  );
  infrastructure.forEach((item, index) =>
    binding(item, `infrastructureOperations[${index}]`, "infrastructure-operation"),
  );
  access.forEach((item, index) => accessOperation(item, `accessOperations[${index}]`));
  ordered(connected, "bindingId", "connectedBindings");
  ordered(infrastructure, "bindingId", "infrastructureOperations");
  ordered(access, "bindingId", "accessOperations");

  const connectedIds = ids(connected, "bindingId", "connectedBindings");
  const infrastructureIds = ids(infrastructure, "bindingId", "infrastructureOperations");
  ids(infrastructure, "id", "infrastructureOperations");
  ids(access, "id", "accessOperations");
  ids(access, "bindingId", "accessOperations");
  for (const id of connectedIds)
    if (infrastructureIds.has(id)) invalid("runtime wiring", `duplicates binding "${id}"`);
  for (const [index, item] of access.entries()) {
    const bindingId = text(
      object(item, `accessOperations[${index}]`).bindingId,
      `accessOperations[${index}].bindingId`,
    );
    if (!infrastructureIds.has(bindingId))
      invalid(
        `accessOperations[${index}].bindingId`,
        "does not reference an infrastructure operation",
      );
  }
}

function binding(
  value: unknown,
  path: string,
  kind: "connected-binding" | "infrastructure-operation",
): void {
  const item = object(value, path);
  const keys = ["kind", "bindingId", "capability", "profile", "adapter", "namedValues"];
  if (kind === "infrastructure-operation") keys.push("id", "integration");
  exact(item, keys, path);
  if (item.kind !== kind) invalid(`${path}.kind`, `must be "${kind}"`);
  for (const key of ["bindingId", "capability", "profile"]) text(item[key], `${path}.${key}`);
  if (kind === "infrastructure-operation") {
    text(item.id, `${path}.id`);
    integration(item.integration, `${path}.integration`, "infrastructure");
  }
  adapter(item.adapter, `${path}.adapter`);
  const names = list(item.namedValues, `${path}.namedValues`);
  names.forEach((entry, index) => namedValue(entry, `${path}.namedValues[${index}]`));
  ordered(names, "field", `${path}.namedValues`, "name");
  ids(names, "field", `${path}.namedValues`);
}

function adapter(value: unknown, path: string): void {
  const item = object(value, path);
  exact(
    item,
    [
      "integrationId",
      "adapterId",
      "protocolVersion",
      "behavior",
      "connectionContract",
      "connection",
      "features",
    ],
    path,
  );
  text(item.integrationId, `${path}.integrationId`);
  text(item.adapterId, `${path}.adapterId`);
  if (item.protocolVersion !== 1) invalid(`${path}.protocolVersion`, "must be 1");
  for (const key of ["behavior", "connectionContract", "connection"])
    object(item[key], `${path}.${key}`);
  strings(item.features, `${path}.features`);
}

function namedValue(value: unknown, path: string): void {
  const item = object(value, path);
  exact(item, ["field", "name", "type", "sensitive"], path);
  for (const key of ["field", "name", "type"]) text(item[key], `${path}.${key}`);
  if (typeof item.sensitive !== "boolean") invalid(`${path}.sensitive`, "must be boolean");
}

function accessOperation(value: unknown, path: string): void {
  const item = object(value, path);
  exact(item, ["kind", "id", "bindingId", "integration"], path);
  if (item.kind !== "access-operation") invalid(`${path}.kind`, 'must be "access-operation"');
  text(item.id, `${path}.id`);
  text(item.bindingId, `${path}.bindingId`);
  integration(item.integration, `${path}.integration`, "access");
}

function integration(value: unknown, path: string, role: string): void {
  const item = object(value, path);
  exact(item, ["role", "integrationId", "protocolVersion", "configuration"], path);
  if (item.role !== role) invalid(`${path}.role`, `must be "${role}"`);
  text(item.integrationId, `${path}.integrationId`);
  if (item.protocolVersion !== 1) invalid(`${path}.protocolVersion`, "must be 1");
  if (!Object.hasOwn(item, "configuration")) invalid(`${path}.configuration`, "is required");
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    invalid(path, "must be an object");
  return value as Record<string, unknown>;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, "must be an array");
  return value;
}

function strings(value: unknown, path: string): void {
  const values = list(value, path).map((item, index) => text(item, `${path}[${index}]`));
  if (new Set(values).size !== values.length || values.join("\0") !== [...values].sort().join("\0"))
    invalid(path, "must contain unique sorted strings");
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") invalid(path, "must be non-empty text");
  return value;
}

function exact(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) invalid(path, `contains unknown field "${unknown.sort()[0]}"`);
}

function ids(values: readonly unknown[], key: string, path: string): Set<string> {
  const result = new Set<string>();
  for (const [index, value] of values.entries()) {
    const id = text(object(value, `${path}[${index}]`)[key], `${path}[${index}].${key}`);
    if (result.has(id)) invalid(path, `duplicates "${id}"`);
    result.add(id);
  }
  return result;
}

function ordered(values: readonly unknown[], key: string, path: string, second?: string): void {
  const actual = values.map((value, index) => {
    const item = object(value, `${path}[${index}]`);
    return `${String(item[key])}\0${second === undefined ? "" : String(item[second])}`;
  });
  if (actual.join("\n") !== [...actual].sort().join("\n")) invalid(path, "must be stable-sorted");
}

function invalid(path: string, reason: string): never {
  throw new DeploymentPlanValidationError(path, reason);
}
