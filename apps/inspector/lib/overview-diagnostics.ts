/** Severity counts and grouping for the diagnostics inbox. */
import type { DiagnosticView } from "./env-diagnostics-model";

export type Severity = DiagnosticView["severity"];
export type DiagnosticGrouping = "severity" | "source";
export type SeverityFilter = Severity | "all";

/** Most urgent first. */
export const SEVERITIES: readonly Severity[] = ["error", "warning", "info"];

export function severityCounts(
  items: readonly DiagnosticView[],
): Readonly<Record<Severity, number>> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const item of items) counts[item.severity] += 1;
  return counts;
}

export interface DiagnosticGroup {
  readonly id: string;
  readonly label: string;
  /** Set when the group is a severity bucket. */
  readonly severity?: Severity;
  readonly items: readonly DiagnosticView[];
}

/**
 * Buckets diagnostics by severity (most urgent first) or by source file (files with errors
 * first, then by name). Items inside a group keep severity order, then their reported order.
 */
export function groupDiagnostics(
  items: readonly DiagnosticView[],
  by: DiagnosticGrouping,
  filter: SeverityFilter = "all",
): readonly DiagnosticGroup[] {
  const visible = sortBySeverity(
    filter === "all" ? items : items.filter((item) => item.severity === filter),
  );
  if (by === "severity")
    return SEVERITIES.flatMap((severity) => {
      const matching = visible.filter((item) => item.severity === severity);
      return matching.length === 0
        ? []
        : [{ id: `severity:${severity}`, label: severity, severity, items: matching }];
    });
  const groups = new Map<string, DiagnosticView[]>();
  for (const item of visible) {
    const key = item.source?.file ?? item.descriptorId ?? "No location";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(
      ([leftKey, left], [rightKey, right]) =>
        rank(left[0]!.severity) - rank(right[0]!.severity) || leftKey.localeCompare(rightKey),
    )
    .map(([key, grouped]) => ({ id: `source:${key}`, label: key, items: grouped }));
}

function sortBySeverity(items: readonly DiagnosticView[]): readonly DiagnosticView[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        rank(left.item.severity) - rank(right.item.severity) || left.index - right.index,
    )
    .map(({ item }) => item);
}

function rank(severity: Severity): number {
  return SEVERITIES.indexOf(severity);
}
