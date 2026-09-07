import type { AddResult, ScaffoldPlan } from "./add-types.js";

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

function section(name: string, values: readonly string[]): string[] {
  return values.length === 0 ? [] : [`${name}:`, ...values.map((value) => `  ${value}`)];
}

function title(value: string): string {
  return value.replaceAll("-", " ").replace(/^./, (character) => character.toUpperCase());
}
