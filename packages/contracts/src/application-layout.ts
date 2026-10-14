/**
 * Selects one immutable flat/grouped layout from graph-visible authored evidence.
 * Compiler discovery owns evidence acquisition; CLI and generator consume the
 * same interpretation and refuse findings before any application mutation.
 */
import {
  declarationLayoutIssues,
  ownershipLayoutIssues,
  missingBoundaryIssues,
} from "./application-layout-issues.js";
import { serviceSource } from "./application-layout-paths.js";
/** Increment when shared source-layout interpretation changes independently of package versions. */
export const APPLICATION_LAYOUT_VERSION = 1 as const;
import type {
  ApplicationLayout,
  ServiceLayoutEvidence,
  ServiceSource,
} from "./application-layout.types.js";

export {
  applicationSourceLayer,
  serviceIdentityPath,
  serviceSource,
  LEGACY_SERVICE_ROOTS,
} from "./application-layout-paths.js";
export type {
  ApplicationLayout,
  ApplicationLayoutKind,
  ApplicationSourceLayer,
  ServiceLayoutEvidence,
  ServiceLayoutIssue,
  ServiceSource,
} from "./application-layout.types.js";

/**
 * Selects layout from declarations; helpers and empty directories provide no evidence.
 * @param projectRoot - Canonical application root retained for consumers.
 * @param input - Normalized, contained authored declaration evidence, not folder listings.
 * @returns A sorted immutable interpretation; any issue blocks publication/mutation.
 * @example
 * ```ts
 * const empty = selectApplicationLayout("/app", []);
 * assert.equal(empty.kind, "grouped");
 * ```
 */
export function selectApplicationLayout(
  projectRoot: string,
  input: readonly ServiceLayoutEvidence[],
): ApplicationLayout {
  const evidence = [...input].sort(
    (left, right) => left.file.localeCompare(right.file) || left.kind.localeCompare(right.kind),
  );
  const roots = new Map<string, ServiceSource>();
  for (const item of evidence) {
    const source = serviceSource(item.file);
    if (source) roots.set(source.root, Object.freeze({ ...source, relative: "" }));
  }
  const services = [...roots.values()].sort((left, right) => left.root.localeCompare(right.root));
  const issues = [
    ...declarationLayoutIssues(evidence),
    ...ownershipLayoutIssues(services),
    ...missingBoundaryIssues(services, evidence),
  ].sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.message.localeCompare(right.message),
  );
  return Object.freeze({
    projectRoot,
    kind: services.some((service) => service.layout === "flat") ? "flat" : "grouped",
    evidence: Object.freeze(evidence.map((item) => Object.freeze({ ...item }))),
    services: Object.freeze(services),
    issues: Object.freeze(issues),
  });
}
