import { formatScaffoldPlan } from "./add-output.js";
import { planAdd } from "./add-plan.js";
import { resolveAddRequestDetails } from "./add-resolver.js";
import { applyScaffoldPlan } from "./add-transaction.js";
import type { AddResult } from "./add-types.js";
import type { GenerateProjectContext } from "./generate-types.js";

export interface StagedAdditions {
  readonly results: readonly AddResult[];
}

export async function addToStagedProject(
  projectRoot: string,
  context: GenerateProjectContext,
): Promise<StagedAdditions> {
  if (!context.interactive || !context.promptDriver) return { results: [] };
  const results: AddResult[] = [];
  while (
    await context.promptDriver.confirm({
      message: results.length ? "Add another artifact?" : "Add an artifact before finishing?",
      initialValue: false,
    })
  ) {
    const resolved = await resolveAddRequestDetails(
      ["--project-root", projectRoot, "--no-install"],
      { cwd: projectRoot, interactive: true, promptDriver: context.promptDriver },
    );
    const plan = await planAdd(resolved.request);
    context.promptDriver.note(formatScaffoldPlan(plan), "Planned changes");
    if (
      !(await context.promptDriver.confirm({ message: "Apply this addition?", initialValue: true }))
    ) {
      continue;
    }
    results.push(
      await applyScaffoldPlan(plan, {
        deferVerification: true,
        ...(context.signal === undefined ? {} : { signal: context.signal }),
        ...(context.onProgress === undefined ? {} : { onProgress: context.onProgress }),
      }),
    );
  }
  return Object.freeze({ results: Object.freeze(results) });
}
