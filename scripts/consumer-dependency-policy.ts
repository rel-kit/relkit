/**
 * Applies the lean-consumer policy to observed paths from four independent
 * boundaries and sums physical installation measurements. This module performs
 * no I/O; collectors own resolution, evidence provenance and lifecycle.
 */
import type {
  ConsumerDependencyPolicy,
  DependencyAccounting,
  DependencyPath,
  InstalledDependency,
} from "./consumer-dependency-policy.types.js";

const forbidden = [
  /^next$/,
  /^react(?:-dom)?$/,
  /^@tanstack\//,
  /^@orpc\/tanstack-query$/,
  /^@pulumi\//,
  /^@(?:aws-sdk|smithy)\//,
  /^(?:@langchain\/|langchain$|langsmith$|deepagents$)/,
  /^@duckdb\//,
  /^(?:better-auth|drizzle-orm|drizzle-kit|pg|postgres|mysql2|better-sqlite3|sqlite3|@libsql\/client)$/,
  /^(?:ioredis|inngest|effect-mq|@trigger\.dev\/sdk)$/,
  /^@sentry\//,
  /^@opentelemetry\/(?:sdk|exporter)/,
  /^@modelcontextprotocol\//,
  /^@ag-ui\//,
  /^@scalar\//,
];

/** Identifies package families whose complete routes require isolation review.
 * @param name - Actual installed or observed package identity.
 * @returns Whether the package is governed by the lean-consumer forbidden-family gate.
 */
export function isForbiddenConsumerDependency(name: string): boolean {
  return forbidden.some((family) => family.test(name));
}

/**
 * Compares a complete observed path without prefix or package-wide exemptions.
 * @param left - Path to inspect.
 * @param right - Exact measured admission.
 * @returns Whether boundary, bundled file and every package hop match.
 */
function samePath(left: DependencyPath, right: DependencyPath): boolean {
  return (
    left.boundary === right.boundary &&
    left.artifact === right.artifact &&
    left.packages.length === right.packages.length &&
    left.packages.every((name, index) => name === right.packages[index])
  );
}

/**
 * Retains forbidden paths, including SDKs embedded inside executable artifacts.
 * @param paths - Independently observed complete dependency paths.
 * @param policy - Stage provenance and exact measured selected capability admissions.
 * @returns Violations in observation order. Baseline reports the final policy.
 */
export function dependencyViolations(
  paths: readonly DependencyPath[],
  policy: ConsumerDependencyPolicy,
): readonly DependencyPath[] {
  return paths.filter((path) => {
    if (!path.packages.some(isForbiddenConsumerDependency)) return false;
    if (policy.selected?.some((selected) => samePath(path, selected))) return false;
    return true;
  });
}

/**
 * Totals physical directories once and compressed archives once per identity.
 * @param observations - Measured installations, including aliases/shared edges.
 * @returns Independent byte totals; unavailable measurements remain null.
 * @throws When duplicate physical paths have inconsistent measured metadata.
 */
export function accountDependencies(
  observations: readonly InstalledDependency[],
): DependencyAccounting {
  const instances = new Map<string, InstalledDependency>();
  for (const item of observations) {
    const previous = instances.get(item.physicalPath);
    if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(item))
      throw new Error(`Conflicting physical dependency observation: ${item.physicalPath}`);
    instances.set(item.physicalPath, item);
  }
  const values = [...instances.values()];
  const archives = new Map(
    values.flatMap((item) =>
      item.archive === null ? [] : [[item.archive.identity, item.archive.bytes] as const],
    ),
  );
  return {
    physicalInstances: values.length,
    archiveBytes: values.some((item) => item.archive === null)
      ? null
      : [...archives.values()].reduce((sum, bytes) => sum + bytes, 0),
    logicalBytes: values.reduce((sum, item) => sum + item.logicalBytes, 0),
    physicalBytes: values.some((item) => item.physicalBytes === null)
      ? null
      : values.reduce((sum, item) => sum + (item.physicalBytes ?? 0), 0),
    nativeFiles: [...new Set(values.flatMap((item) => item.nativeFiles))].sort(),
  };
}
