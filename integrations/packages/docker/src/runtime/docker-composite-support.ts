import type {
  LocalServiceStartRequest,
  NormalizedLocalServiceRecipe,
} from "@relkit/local-service";
import type { DockerClient } from "./docker-types.js";

export function volumeNames(
  serviceName: string,
  requested: Readonly<Record<string, string>> | undefined,
  recipe: NormalizedLocalServiceRecipe,
): Readonly<Record<string, string>> {
  const values = Object.fromEntries(
    Object.keys(recipe.volumes).sort().map((name) => [name, requested?.[name] ?? `${serviceName}-${name}`]),
  );
  if (new Set(Object.values(values)).size !== Object.keys(values).length) {
    throw new TypeError("Composite local-service volumes must have unique Docker names");
  }
  return Object.freeze(values);
}

export function compositeLabels(values: Readonly<Record<string, string>>): string[] {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => ["--label", `${key}=${argument(value)}`]);
}

export function healthArgs(
  command: readonly string[],
  interval: number,
  timeout: number,
  retries: number,
): string[] {
  return [
    "--health-cmd",
    command.map(argument).join(" "),
    "--health-interval",
    `${positive(interval)}ms`,
    "--health-timeout",
    `${positive(timeout)}ms`,
    "--health-retries",
    String(positive(retries)),
  ];
}

export function compositeSignal(request: LocalServiceStartRequest): { readonly signal?: AbortSignal } {
  return request.signal === undefined ? {} : { signal: request.signal };
}

export function resourceName(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)) throw new TypeError("Docker resource name is invalid");
}

export function mountPath(value: string): string {
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(value) || value.includes("..")) throw new TypeError("Docker mount is invalid");
  return value;
}

export function argument(value: string): string {
  if (value === "" || /[\0\r\n]/.test(value)) throw new TypeError("Docker argument is invalid");
  return value;
}

export function environmentArguments(values: Readonly<Record<string, string>> | undefined): string[] {
  return Object.entries(values ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => {
      if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /[\0\r\n]/.test(value)) {
        throw new TypeError("Docker environment variable is invalid");
      }
      return ["--env", `${key}=${value}`];
    });
}

export function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("Docker recipe number is invalid");
  return value;
}

export async function inspectNetwork(
  client: DockerClient,
  networkName: string,
  request: LocalServiceStartRequest,
): Promise<Readonly<Record<string, string>> | undefined> {
  try {
    const output = await client.command(
      ["network", "inspect", "--format", "{{json .Labels}}", networkName],
      "Docker network inspection",
      compositeSignal(request),
    );
    const value: unknown = JSON.parse(output);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Docker network labels are invalid.");
    }
    return value as Readonly<Record<string, string>>;
  } catch (error) {
    if (error instanceof Error && error.message.includes("exit code")) return undefined;
    if (error instanceof SyntaxError) throw new Error("Docker network labels are invalid.");
    throw error;
  }
}

export function owned(
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}
