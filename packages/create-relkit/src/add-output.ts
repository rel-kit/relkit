import type { AddResult, ScaffoldPlan } from "./add-types.js";

/**
 * Formats a scaffold plan for review before mutation.
 * @param plan - Complete immutable scaffold plan.
 * @returns Human-readable create/update/dependency/profile sections and applicable warnings.
 */
export function formatScaffoldPlan(plan: ScaffoldPlan): string {
  const created = plan.operations.filter((item) => item.action === "create");
  const updated = plan.operations.filter((item) => item.action === "update");
  const dependencies = Object.entries(plan.dependencies);
  return [
    `${title(plan.request.kind)} scaffold`,
    ...section(
      "Create",
      created.map((item) => item.path),
    ),
    ...section(
      "Update",
      updated.map((item) => item.path),
    ),
    ...section(
      "Dependencies",
      dependencies.map(([name, version]) => `${name}@${version}`),
    ),
    ...section(
      "Profiles",
      plan.profiles.map((profile) => `${profile.capability}:${profile.name}`),
    ),
    ...section(
      "Warnings",
      plan.warnings
        .filter((warning) => warning.code !== "docker-required")
        .map((warning) => warning.message),
    ),
  ].join("\n");
}

/**
 * Formats the completed add result and verification status.
 * @param result - Completed scaffold transaction result.
 * @returns Human-readable file/package changes, warnings and next steps.
 */
export function formatAddResult(result: AddResult): string {
  return [
    `Added ${result.kind}.`,
    ...section("Created", result.createdFiles),
    ...section("Updated", result.updatedFiles),
    ...section("Installed", result.installedPackages),
    ...section(
      "Warnings",
      result.warnings.map((warning) => warning.message),
    ),
    `Verification: ${result.verification.status}`,
    ...section("Next", result.nextSteps),
  ].join("\n");
}

/**
 * Builds an optional titled output section.
 * @param name - Section title.
 * @param values - Ordered entries shown beneath the title.
 * @returns An empty array when there are no values, otherwise a title and indented entries.
 */
function section(name: string, values: readonly string[]): string[] {
  return values.length === 0 ? [] : [`${name}:`, ...values.map((value) => `  ${value}`)];
}

/**
 * Creates a human-readable title from a hyphenated identifier.
 * @param value - Hyphenated identifier to display.
 * @returns The identifier with spaces and an uppercase initial character.
 */
function title(value: string): string {
  return value.replaceAll("-", " ").replace(/^./, (character) => character.toUpperCase());
}
