import type { MutationReport, MutationTarget } from "./verify-mutation.types.js";

const categories = [
  {
    name: "tenant checks",
    targets: [{ file: "packages/jobs/src/authorization-grant.ts", start: 26, end: 37 }],
  },
  {
    name: "abort cleanup",
    targets: [
      { file: "packages/client/src/jobs/controller.service.ts", start: 97, end: 108 },
      { file: "packages/client/src/jobs/controller.service.ts", start: 222, end: 246 },
    ],
  },
  {
    name: "stale epochs",
    targets: [
      { file: "packages/client/src/jobs/controller.service.ts", start: 90, end: 93 },
      { file: "packages/client/src/jobs/controller.service.ts", start: 111, end: 142 },
      { file: "packages/client/src/jobs/controller.service.ts", start: 201, end: 220 },
    ],
  },
  {
    name: "memory conversion",
    targets: [{ file: "packages/jobs/src/task-policy-value.ts", start: 74, end: 88 }],
  },
  {
    name: "retry-budget multiplication",
    targets: [{ file: "packages/jobs/src/task-policy-value.ts", start: 113, end: 116 }],
  },
  {
    name: "duration conversion",
    targets: [{ file: "packages/jobs/src/duration.ts", start: 60, end: 88 }],
  },
] satisfies readonly { readonly name: string; readonly targets: readonly MutationTarget[] }[];

/**
 * Requires an actual killed mutant for every retained semantic responsibility.
 * @param report - Complete Stryker JSON report from the native test runner.
 * @returns Category and whole-campaign summaries after rejecting errors or missing kills.
 * @example
 * ```ts
 * import { verifyMutationReport } from "./verify-mutation.js";
 * const report = await Bun.file("reports/mutation/mutation.json").json();
 * console.log(verifyMutationReport(report));
 * ```
 */
export function verifyMutationReport(report: MutationReport): readonly string[] {
  const mutants = Object.entries(report.files).flatMap(([file, entry]) =>
    entry.mutants.map((mutant) => ({ file, mutant })),
  );
  const errors = mutants.filter(({ mutant }) => mutant.status === "Error");
  if (errors.length > 0) throw new Error(`Mutation run produced ${errors.length} errors.`);
  const summaries = categories.map((category) => {
    const relevant = mutants.filter(({ file, mutant }) => {
      const line = mutant.location?.start?.line ?? -1;
      return category.targets.some(
        (target) => file === target.file && line >= target.start && line <= target.end,
      );
    });
    const killed = relevant.filter(({ mutant }) => mutant.status === "Killed").length;
    if (killed === 0) throw new Error(`Mutation checks did not kill a ${category.name} mutant.`);
    return `${category.name}: ${killed} killed / ${relevant.length} targeted mutants`;
  });
  const killed = mutants.filter(({ mutant }) => mutant.status === "Killed").length;
  const survived = mutants.filter(({ mutant }) => mutant.status === "Survived").length;
  const noCoverage = mutants.filter(({ mutant }) => mutant.status === "NoCoverage").length;
  return [
    ...summaries,
    `mutation semantic gate passed: ${killed} killed, ${survived} survived, ${noCoverage} no-coverage`,
  ];
}

if (import.meta.main) {
  const report = (await Bun.file("reports/mutation/mutation.json").json()) as MutationReport;
  for (const summary of verifyMutationReport(report)) console.log(summary);
}
