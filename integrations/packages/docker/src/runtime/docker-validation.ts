import { DockerEngineError, type DockerCommandOptions } from "./docker-types.js";

export function labelFilters(labels: Readonly<Record<string, string>> | undefined): string[] {
  return Object.entries(labels ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.\-/]*$/.test(key)) invalidArgument();
      validateArgument(value);
      return ["--filter", `label=${key}=${value}`];
    });
}

export function resourceLines(value: string): string[] {
  const values =
    value === ""
      ? []
      : value
          .split(/\r?\n/)
          .map((entry) => entry.trim())
          .filter(Boolean);
  values.forEach(validateResourceId);
  return values;
}

export function validateArguments(values: readonly string[]): void {
  if (values.length === 0) invalidArgument();
  values.forEach(validateArgument);
}

export function validateArgument(value: string): void {
  if (typeof value !== "string" || value === "" || /[\0\r\n]/.test(value)) invalidArgument();
}

export function validateResourceId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value)) invalidArgument();
}

export function positive(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DockerEngineError("RELKIT_DOCKER_ARGUMENT_INVALID", `${name} is invalid.`);
  }
  return value;
}

export function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") invalidArgument();
  validateArgument(value);
  return value.trim();
}

export function responseText(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") invalidResponse();
  return value.trim();
}

export function optionalSignal(signal: AbortSignal | undefined): DockerCommandOptions {
  return signal === undefined ? {} : { signal };
}

export function invalidArgument(): never {
  throw new DockerEngineError("RELKIT_DOCKER_ARGUMENT_INVALID", "Docker argument is invalid.");
}

export function invalidResponse(): never {
  throw new DockerEngineError("RELKIT_DOCKER_RESPONSE_INVALID", "Docker returned invalid data.");
}

export function cancelled(): never {
  throw new DockerEngineError("RELKIT_DOCKER_CANCELLED", "Docker operation was cancelled.");
}
