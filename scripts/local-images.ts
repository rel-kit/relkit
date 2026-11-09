/**
 * Pulls the Docker images a template's local services use, so measured starts do not include
 * a first-time image download. Only the `tasks` template starts local services in Docker.
 */
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CREATE_TASKS_DEFAULT_JOBS, type CreateJobs, type CreateTemplate } from "create-relkit";

const root = resolve(import.meta.dir, "..");

interface RecipeUnit {
  readonly image?: string;
}

interface LocalRecipe {
  readonly containers?: readonly RecipeUnit[];
  readonly workers?: readonly RecipeUnit[];
  readonly init?: readonly RecipeUnit[];
}

/**
 * Lists the pinned images of a jobs provider's local recipe.
 * @param jobs - Jobs provider selected for the template.
 * @returns Distinct image references in recipe order.
 */
export async function localRecipeImages(jobs: CreateJobs): Promise<readonly string[]> {
  const integration = jobs.replace(/-docker$/u, "");
  const module = pathToFileURL(join(root, "integrations/packages", integration, "src/local.ts"));
  const { localRecipe } = (await import(module.href)) as { localRecipe: LocalRecipe };
  const units = [
    ...(localRecipe.containers ?? []),
    ...(localRecipe.workers ?? []),
    ...(localRecipe.init ?? []),
  ];
  return [...new Set(units.flatMap((unit) => (unit.image === undefined ? [] : [unit.image])))];
}

/**
 * Pulls every image the template's local services need before measurement.
 * @param template - Template about to be measured.
 * @returns Completion after each `docker pull` succeeds; templates without Docker services do nothing.
 */
export async function pullTemplateImages(template: CreateTemplate): Promise<void> {
  if (template !== "tasks") return;
  for (const image of await localRecipeImages(CREATE_TASKS_DEFAULT_JOBS)) {
    const child = Bun.spawn(["docker", "pull", "--quiet", image], {
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await child.exited;
    if (code !== 0) throw new Error(`docker pull ${image} failed (${code})`);
  }
}
