type Mutant = {
  readonly status: string;
  readonly location?: { readonly start?: { readonly line?: number } };
};

type MutationReport = {
  readonly files: Record<string, { readonly mutants: readonly Mutant[] }>;
};

const report = (await Bun.file("reports/mutation/mutation.json").json()) as MutationReport;
const mutants = Object.entries(report.files).flatMap(([file, entry]) =>
  entry.mutants.map((mutant) => ({ file, mutant })),
);
const errors = mutants.filter(({ mutant }) => mutant.status === "Error");
if (errors.length > 0) {
  throw new Error(`Mutation run produced ${errors.length} errors.`);
}

const categories = [
  { name: "tenant checks", file: "packages/jobs/src/authorization.ts", start: 29, end: 43 },
  { name: "abort cleanup", file: "packages/client/src/jobs/controller.ts", start: 60, end: 83 },
  { name: "stale epochs", file: "packages/client/src/jobs/controller.ts", start: 122, end: 165 },
  {
    name: "invalid policy conversion",
    file: "packages/jobs/src/task-policy-validation.ts",
    start: 42,
    end: 56,
  },
  {
    name: "retry-budget multiplication",
    file: "packages/jobs/src/task-policy-validation.ts",
    start: 73,
    end: 81,
  },
  { name: "duration conversion", file: "packages/jobs/src/duration.ts", start: 37, end: 72 },
];

for (const category of categories) {
  const relevant = mutants.filter(({ file, mutant }) => {
    const line = mutant.location?.start?.line ?? -1;
    return file === category.file && line >= category.start && line <= category.end;
  });
  const killed = relevant.filter(({ mutant }) => mutant.status === "Killed").length;
  if (killed === 0) throw new Error(`Mutation checks did not kill a ${category.name} mutant.`);
  console.log(`${category.name}: ${killed} killed / ${relevant.length} targeted mutants`);
}

const killed = mutants.filter(({ mutant }) => mutant.status === "Killed").length;
const survived = mutants.filter(({ mutant }) => mutant.status === "Survived").length;
const noCoverage = mutants.filter(({ mutant }) => mutant.status === "NoCoverage").length;
console.log(
  `mutation semantic gate passed: ${killed} killed, ${survived} survived, ${noCoverage} no-coverage`,
);
