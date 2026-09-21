import { DeploymentPlanValidationError } from "./plan-validation.js";

export function job(value: unknown, path: string): void {
  const item = object(value, path);
  exact(
    item,
    [
      "id",
      "logicalName",
      "bindingId",
      "profile",
      "configurationNames",
      "capabilities",
      "tags",
      "metadata",
      "targetFunctionId",
      "executionModel",
      "jobId",
      "name",
      "taskId",
      "taskVersion",
      "buildId",
      "serviceGeneration",
      "retry",
      "timeoutMs",
      "concurrency",
      "idempotency",
      "policy",
      "schedules",
      "worker",
    ],
    path,
  );
  for (const key of ["id", "logicalName", "bindingId", "profile", "configurationNames"])
    if (key === "configurationNames") strings(item[key], `${path}.${key}`);
    else text(item[key], `${path}.${key}`);
  if (item.executionModel === "task") {
    for (const key of ["jobId", "name", "taskId", "taskVersion", "buildId", "serviceGeneration"])
      text(item[key], `${path}.${key}`);
    if (Object.hasOwn(item, "targetFunctionId"))
      invalid(path, "mixes task and legacy target fields");
    worker(item.worker, `${path}.worker`);
  } else if (item.executionModel !== undefined && item.executionModel !== "legacy-function") {
    invalid(`${path}.executionModel`, "is unsupported");
  }
}

function worker(value: unknown, path: string): void {
  const item = object(value, path);
  exact(
    item,
    [
      "provider",
      "publication",
      "taskId",
      "taskVersion",
      "buildId",
      "serviceGeneration",
      "runtime",
      "limits",
      "schemaHashes",
      "policy",
      "stages",
    ],
    path,
  );
  for (const key of [
    "provider",
    "taskId",
    "taskVersion",
    "buildId",
    "serviceGeneration",
    "runtime",
  ])
    text(item[key], `${path}.${key}`);
  if (item.publication !== "native") invalid(`${path}.publication`, 'must be "native"');
  const stages = list(item.stages, `${path}.stages`);
  if (stages.join("\0") !== "provision\0secrets\0publish\0register\0readiness\0schedules\0activate")
    invalid(`${path}.stages`, "must contain the deployment stages in order");
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

function invalid(path: string, reason: string): never {
  throw new DeploymentPlanValidationError(path, reason);
}
