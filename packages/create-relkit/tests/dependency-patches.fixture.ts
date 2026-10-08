import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlanBuilder } from "../src/plan-builder.js";
import { SCAFFOLD_DEPENDENCIES } from "../src/scaffold-catalog.js";
import type { ScaffoldDependencyName } from "../src/scaffold-catalog.types.js";

export async function withProject(
  run: (root: string) => Promise<void>,
  extra: Readonly<Record<string, unknown>> = {},
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "relkit-dependency-patch-"));
  try {
    await writeFile(
      join(root, "package.json"),
      `${JSON.stringify(
        {
          name: "patch-example",
          dependencies: { "drizzle-orm": SCAFFOLD_DEPENDENCIES["drizzle-orm"].version },
          scripts: {},
          ...extra,
        },
        null,
        2,
      )}\n`,
    );
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export function patchBuilder(
  root: string,
  install = true,
  dependencies: readonly ScaffoldDependencyName[] = ["drizzle-orm"],
): PlanBuilder {
  const builder = new PlanBuilder(
    { kind: "function", name: "value", internal: false, projectRoot: root, install },
    {
      projectRoot: root,
      packagePath: join(root, "package.json"),
      appPath: join(root, "relkit.config.ts"),
      appFactory: "defineApp",
      services: [],
      artifacts: [],
      profiles: [],
      awsPulumiDeployment: false,
    },
  );
  for (const name of dependencies) builder.dependency(name);
  return builder;
}
