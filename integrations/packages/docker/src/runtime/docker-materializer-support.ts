export function labelArguments(values: Readonly<Record<string, string>>): string[] {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => ["--label", `${labelKey(key)}=${argument(value)}`]);
}

export function networkLabelFilters(values: Readonly<Record<string, string>>): string[] {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => ["--filter", `label=${labelKey(key)}=${argument(value)}`]);
}

export function labels(values: Readonly<Record<string, string>>): void {
  if (Object.keys(values).length === 0) invalid("Docker labels");
  labelArguments(values);
}

export function labelKey(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.\-/]*$/.test(value)) invalid("Docker label");
  return value;
}

export function healthCommand(values: readonly string[]): string {
  if (values.length === 0 || values.some((value) => !/^[a-zA-Z0-9_./:=?-]+$/.test(value))) {
    invalid("Docker health command");
  }
  return values.join(" ");
}

export function resourceName(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value)) invalid("Docker resource");
  return value;
}

export function name(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)) invalid("Docker resource name");
  return value;
}

export function mountPath(value: string): string {
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(value) || value.includes("..")) invalid("Docker mount");
  return value;
}

export function duration(value: number): string {
  return `${positive(value)}ms`;
}

export function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) invalid("Docker recipe number");
  return value;
}

export function argument(value: string): string {
  if (typeof value !== "string" || value === "" || /[\0\r\n]/.test(value)) {
    invalid("Docker argument");
  }
  return value;
}

function invalid(name: string): never {
  throw new TypeError(`${name} is invalid.`);
}
