/**
 * Carries measured physical installations and observed dependency paths between
 * the collector and policy checker. Absent size measurements stay explicit;
 * callers cannot substitute workspace lock entries for physical observations.
 */

/** Independently measured resolution surface. */
export type DependencyBoundary = "installation" | "evaluation" | "declarations" | "artifact";

/** A complete observed path, with an optional exact bundled file identity. */
export interface DependencyPath {
  readonly boundary: DependencyBoundary;
  readonly packages: readonly string[];
  readonly artifact?: string;
}

/** Selected capability paths and enumerated temporary legacy inspector paths. */
export interface ConsumerDependencyPolicy {
  readonly stage: "baseline" | "1" | "final";
  readonly exceptions: readonly DependencyPath[];
  readonly selected?: readonly DependencyPath[];
}

/** One actual installed directory; aliases share the canonical physical path. */
export interface InstalledDependency {
  readonly name: string;
  readonly version: string;
  readonly physicalPath: string;
  readonly logicalBytes: number;
  readonly physicalBytes: number | null;
  readonly archive: { readonly identity: string; readonly bytes: number } | null;
  readonly nativeFiles: readonly string[];
}

/** Aggregates unique installations and unique compressed archives separately. */
export interface DependencyAccounting {
  readonly physicalInstances: number;
  readonly archiveBytes: number | null;
  readonly logicalBytes: number;
  readonly physicalBytes: number | null;
  readonly nativeFiles: readonly string[];
}
