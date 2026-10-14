/**
 * Reports invalid source boundary shapes and collisions for the shared layout
 * selection. Messages retain physical paths and suggest the supported boundary;
 * callers translate these pure findings to diagnostics or scaffold conflicts.
 */
import { LEGACY_SERVICE_ROOTS, serviceSource } from "./application-layout-paths.js";
import type {
  ServiceLayoutEvidence,
  ServiceLayoutIssue,
  ServiceSource,
} from "./application-layout.types.js";

/**
 * Checks declaration placement without evaluating runtime descriptor values.
 * @param evidence - Graph-visible source declarations in deterministic order.
 * @returns Structural issues for invalid names, removed roots and service boundaries.
 */
export function declarationLayoutIssues(
  evidence: readonly ServiceLayoutEvidence[],
): ServiceLayoutIssue[] {
  const issues: ServiceLayoutIssue[] = [];
  for (const item of evidence) {
    const source = serviceSource(item.file);
    if (item.file === "src/services/service.ts") {
      issues.push(
        issue(
          item.file,
          "src/services is a grouping container. Use src/services/<service>/service.ts.",
        ),
      );
      continue;
    }
    if (!source) continue;
    if (!/^[a-z][a-z0-9-]*$/.test(source.name)) {
      issues.push(
        issue(item.file, `Service directory "${source.name}" is not a valid service ID.`),
      );
    }
    if (LEGACY_SERVICE_ROOTS.has(source.name) && source.layout === "flat") {
      issues.push(
        issue(item.file, `Legacy layer-first root "${source.root}" must become a domain.`),
      );
    }
    if (item.kind === "service" && item.file !== source.boundary) {
      issues.push(
        issue(
          item.file,
          `Independent nested or misplaced service. Use the sole boundary ${source.boundary}.`,
        ),
      );
    }
  }
  return issues;
}

/**
 * Finds mixed roots and case/duplicate ownership before normal assignment.
 * @param services - Unique physical service roots ordered by their full path.
 * @returns Every conflicting ownership finding with both sources retained.
 */
export function ownershipLayoutIssues(services: readonly ServiceSource[]): ServiceLayoutIssue[] {
  const issues: ServiceLayoutIssue[] = [];
  const flat = services.find((service) => service.layout === "flat");
  const grouped = services.find((service) => service.layout === "grouped");
  if (flat && grouped) {
    issues.push(
      issue(
        flat.boundary,
        `Mixed service layouts: ${flat.root} and ${grouped.root}. Use one layout per application.`,
        [grouped.boundary],
      ),
    );
  }
  const names = new Map<string, ServiceSource>();
  for (const service of services) {
    const previous = names.get(service.name.toLowerCase());
    if (previous && previous.root !== service.root) {
      issues.push(
        issue(
          service.boundary,
          `Duplicate or case-colliding service roots: ${previous.root} and ${service.root}.`,
          [previous.boundary],
        ),
      );
    } else names.set(service.name.toLowerCase(), service);
  }
  return issues;
}

/**
 * Requires an authored service declaration at each evidenced owner's public boundary.
 * @param services - Unique physical service roots selected from declarations.
 * @param evidence - Graph-visible declarations, including missing-boundary candidates.
 * @returns Missing-boundary findings with the actual orphaned declaration sources.
 */
export function missingBoundaryIssues(
  services: readonly ServiceSource[],
  evidence: readonly ServiceLayoutEvidence[],
): ServiceLayoutIssue[] {
  return services.flatMap((service) => {
    if (evidence.some((item) => item.kind === "service" && item.file === service.boundary))
      return [];
    const origins = evidence
      .filter((item) => item.file.startsWith(`${service.root}/`))
      .map((item) => item.file);
    return [
      issue(
        service.boundary,
        `Domain "${service.name}" must export exactly one service at ${service.boundary}.`,
        origins,
      ),
    ];
  });
}

/**
 * Constructs one structural finding with immutable related-source evidence.
 * @param file - Physical source receiving the finding.
 * @param message - Safe boundary explanation and remediation.
 * @param related - Other physical origins involved in the conflict.
 * @returns A shared internal layout issue, without live resources or exceptions.
 */
function issue(file: string, message: string, related: readonly string[] = []): ServiceLayoutIssue {
  return Object.freeze({
    code: "RELKIT_SERVICE_LAYOUT",
    file,
    message,
    related: Object.freeze([...related]),
  });
}
