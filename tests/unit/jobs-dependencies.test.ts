/** Keeps the creator's jobs SDK list in step with what each jobs integration declares. */
import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { jobsNativeDependencies } from "../../packages/create-relkit/src/jobs-dependencies.ts";
import { CREATE_JOBS } from "../../packages/create-relkit/src/options.ts";

const root = resolve(import.meta.dir, "../..");

test("generated projects install every native SDK their jobs provider declares", async () => {
  for (const jobs of CREATE_JOBS) {
    const integration = jobs.replace(/-docker$/u, "");
    const manifest = await Bun.file(
      join(root, "integrations/packages", integration, "package.json"),
    ).json();
    const declared = Object.fromEntries(
      (
        manifest.relkit.integration.dependencies as {
          package: string;
          supportedRange: string;
          installSection: string;
        }[]
      )
        .filter((dependency) => dependency.installSection === "dependencies")
        .map((dependency) => [dependency.package, dependency.supportedRange]),
    );
    expect({ jobs, dependencies: jobsNativeDependencies(jobs) }).toEqual({
      jobs,
      dependencies: declared,
    });
  }
});
