/**
 * Prepares the newcomer project the Vercel deploy test ships: the `api` template created from the
 * packed candidate, Postgres jobs and events added with `relkit add`, the same probe service as the
 * Railway test (a scheduled job, an HTTP-triggered task, an event and its consumer), and
 * `relkit deploy init vercel`. The candidate's tarballs are vendored into the project, because
 * Vercel's builder cannot reach the local registry the project was created from.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { preparePackedFixture } from "../dev-readiness/packed-fixture.js";
import { PROBE_FILES } from "../railway-newcomer/probe-sources.js";
import { run, vendorCandidate } from "../railway-newcomer/project.js";

/** A prepared project and the temporary directory to remove afterwards. */
export interface VercelNewcomerProject {
  readonly projectRoot: string;
  readonly temporary: string;
}

/** An environment that resets any registry override to the public npm registry. */
const PUBLIC_REGISTRY = {
  BUN_CONFIG_REGISTRY: "https://registry.npmjs.org",
  npm_config_registry: "https://registry.npmjs.org",
};

/**
 * Packs the checkout, creates the project and makes it deployable without the local registry.
 * @param repository - Framework checkout.
 * @param artifacts - Optional previously packed release directory.
 * @returns The prepared project.
 */
export async function prepareVercelNewcomerProject(
  repository: string,
  artifacts?: string,
): Promise<VercelNewcomerProject> {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* preparePackedFixture(repository, "examples", artifacts, "api");
        const registry = { BUN_CONFIG_REGISTRY: fixture.registry };
        const project = fixture.projectRoot;
        const relkit = join(project, "node_modules/.bin/relkit");
        yield* Effect.promise(async () => {
          await run([relkit, "add", "jobs", "--provider", "postgres"], project, registry);
          await run([relkit, "add", "events", "--provider", "postgres"], project, registry);
          for (const [path, content] of Object.entries(PROBE_FILES)) {
            await mkdir(join(project, path, ".."), { recursive: true });
            await writeFile(join(project, path), content);
          }
          await includeEventRegistry(project);
          await vendorCandidate(project, fixture.artifacts);
          await rm(join(project, "bun.lock"), { force: true });
          await rm(join(project, "node_modules"), { recursive: true, force: true });
          await run([process.execPath, "install"], project, PUBLIC_REGISTRY);
          await run([relkit, "check"], project);
          await run([relkit, "deploy", "init", "vercel"], project);
          // The remote build runs the same command; fail here first when the project is not ready.
          await run([relkit, "build", "--target", "vercel"], project);
        });
        return { projectRoot: project, temporary: fixture.temporary };
      }),
    ),
  );
}

/**
 * Adds the generated event registry to the type-checked files, which event functions need; the
 * template lists only the route checks and the context registry.
 * @param project - Project root.
 * @returns Completion.
 */
async function includeEventRegistry(project: string): Promise<void> {
  const path = join(project, "tsconfig.json");
  const source = await readFile(path, "utf8");
  const context = '".relkit/generated/context-registry.d.ts"';
  if (source.includes("event-registry.d.ts")) return;
  await writeFile(
    path,
    source.replace(context, `${context}, ".relkit/generated/event-registry.d.ts"`),
  );
}
