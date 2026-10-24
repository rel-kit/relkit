/** Shares the original deterministic fixture constants and helpers across cohesive add-transaction cases. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ScaffoldPlan } from "../../packages/cli/src/scaffolding/index.ts";
export function createPlan(
  root: string,
  overrides: Partial<ScaffoldPlan> & { readonly install?: boolean } = {},
): ScaffoldPlan {
  return {
    projectRoot: root,
    request: {
      kind: "function",
      name: "value",
      projectRoot: root,
      install: overrides.install ?? true,
      internal: false,
    },
    operations: [],
    dependencies: {},
    artifacts: [],
    profiles: [],
    warnings: [],
    nextSteps: [],
    ...overrides,
  };
}

export async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "relkit-add-transaction-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
