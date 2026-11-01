/** Groups value-free environment metadata into the tree shown on /env. */
import type { EnvironmentFieldView } from "./env-diagnostics-model";

export type EnvironmentGrouping = "prefix" | "source" | "sensitivity";

export interface EnvironmentGroupData {
  readonly id: string;
  readonly label: string;
  readonly fields: readonly EnvironmentFieldView[];
}

const UNGROUPED = "Ungrouped";

/**
 * Longest `SEGMENT_` prefix shared with at least one other key, e.g. `BETTER_AUTH_` for
 * `BETTER_AUTH_URL` beside `BETTER_AUTH_SECRET`; undefined when the key stands alone.
 */
export function keyPrefix(name: string, names: readonly string[]): string | undefined {
  const segments = name.split("_");
  for (let size = segments.length - 1; size >= 1; size -= 1) {
    const prefix = `${segments.slice(0, size).join("_")}_`;
    if (prefix === "_") continue;
    if (names.filter((other) => other.startsWith(prefix)).length >= 2) return prefix;
  }
  return undefined;
}

/** Groups keys by shared prefix, declaring file, or sensitivity; ungrouped keys sort last. */
export function groupEnvironment(
  fields: readonly EnvironmentFieldView[],
  mode: EnvironmentGrouping,
): readonly EnvironmentGroupData[] {
  const names = fields.map((field) => field.name);
  const groups = new Map<string, EnvironmentFieldView[]>();
  for (const field of fields) {
    const key = groupKey(field, mode, names);
    groups.set(key, [...(groups.get(key) ?? []), field]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) =>
      left === UNGROUPED ? 1 : right === UNGROUPED ? -1 : left.localeCompare(right),
    )
    .map(([key, items]) => ({
      id: `${mode}:${key}`,
      label: mode === "prefix" && key !== UNGROUPED ? `${key}*` : key,
      fields: [...items].sort((left, right) => left.name.localeCompare(right.name)),
    }));
}

function groupKey(
  field: EnvironmentFieldView,
  mode: EnvironmentGrouping,
  names: readonly string[],
): string {
  if (mode === "source") return field.source?.file ?? "Source unavailable";
  if (mode === "sensitivity") return field.sensitive ? "Secrets" : "Plain values";
  return keyPrefix(field.name, names) ?? UNGROUPED;
}

/** "Required in production", "Optional", "Required by default". */
export function requirementLabel(field: EnvironmentFieldView): string {
  if (field.requiredIn.length > 0) return `Required in ${field.requiredIn.join(", ")}`;
  return field.optional ? "Optional" : "Required by default";
}

export interface EnvironmentFlag {
  readonly label: string;
  readonly tone: "warning" | "info" | "neutral";
}

/** The badges a key row carries: secret first, then how it is satisfied. */
export function environmentFlags(field: EnvironmentFieldView): readonly EnvironmentFlag[] {
  const flags: EnvironmentFlag[] = [];
  if (field.sensitive) flags.push({ label: "secret", tone: "warning" });
  if (field.hasDefault) flags.push({ label: "default", tone: "neutral" });
  else if (field.optional) flags.push({ label: "optional", tone: "neutral" });
  else flags.push({ label: "required", tone: "info" });
  return flags;
}
