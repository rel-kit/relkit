/**
 * Prepares the newcomer project the Railway deploy test ships: the `api` template created from the
 * packed candidate, Postgres jobs and events added with `relkit add`, a small probe service with a
 * scheduled job, an event and its consumer, and `relkit deploy init railway`. The candidate's
 * tarballs are vendored into the project, because Railway's builder cannot reach the local registry
 * the project was created from.
 */
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Effect } from "effect";
import { preparePackedFixture } from "../dev-readiness/packed-fixture.js";
import { PROBE_FILES } from "./probe-sources.js";

/** A prepared project and how it was made. */
export interface NewcomerProject {
  readonly projectRoot: string;
  readonly temporary: string;
  readonly runtime: "bun" | "node";
}

/**
 * Runs a command in the project with inherited output.
 * @param command - Executable and arguments.
 * @param cwd - Working directory.
 * @param env - Extra environment.
 * @returns Standard output.
 */
export async function run(
  command: readonly string[],
  cwd: string,
  env: Record<string, string> = {},
): Promise<string> {
  const child = Bun.spawn([...command], {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "inherit",
  });
  const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  if (code !== 0) throw new Error(`${command.join(" ")} failed in ${cwd} (exit ${code})`);
  return output;
}

/**
 * Packs the checkout, creates the project and makes it deployable without the local registry.
 * @param repository - Framework checkout.
 * @param runtime - Server runtime of the image.
 * @param artifacts - Optional previously packed release directory.
 * @returns The prepared project.
 */
export async function prepareNewcomerProject(
  repository: string,
  runtime: "bun" | "node",
  artifacts?: string,
): Promise<NewcomerProject> {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* preparePackedFixture(repository, "examples", artifacts, "api");
        const registry = { BUN_CONFIG_REGISTRY: fixture.registry };
        const project = fixture.projectRoot;
        const relkit = join(project, "node_modules/.bin/relkit");
        yield* Effect.promise(async () => {
          // A newcomer selects the durable backend with the CLI, as the guide says.
          await run([relkit, "add", "jobs", "--provider", "postgres"], project, registry);
          await run([relkit, "add", "events", "--provider", "postgres"], project, registry);
          for (const [path, content] of Object.entries(PROBE_FILES)) {
            await mkdir(join(project, path, ".."), { recursive: true });
            await writeFile(join(project, path), content);
          }
          await assertPostgresSelected(project);
          await includeEventRegistry(project);
          await vendorCandidate(project, fixture.artifacts);
          // Resolve the lockfile against the public registry: the local one's URLs would leak into
          // bun.lock, and the vendored tarballs plus overrides now supply every candidate package.
          await rm(join(project, "bun.lock"), { force: true });
          await rm(join(project, "node_modules"), { recursive: true, force: true });
          await run([process.execPath, "install"], project, publicRegistry());
          await run([relkit, "check"], project);
          await run([relkit, "deploy", "init", "railway", "--runtime", runtime], project);
        });
        return { projectRoot: project, temporary: fixture.temporary, runtime };
      }),
    ),
  );
}

/**
 * Confirms `relkit add` selected the Postgres jobs and events providers.
 * @param project - Project root.
 * @returns Completion.
 */
async function assertPostgresSelected(project: string): Promise<void> {
  const config = await readFile(join(project, "relkit.config.ts"), "utf8");
  if (!config.includes("postgresJob") || !config.includes("postgresEvent"))
    throw new Error("relkit add did not select the Postgres jobs and events providers.");
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
  if (!source.includes(context))
    throw new Error("tsconfig.json does not list the context registry.");
  await writeFile(
    path,
    source.replace(context, `${context}, ".relkit/generated/event-registry.d.ts"`),
  );
}

/** @returns An environment that resets any registry override to the public npm registry. */
function publicRegistry(): Record<string, string> {
  return {
    BUN_CONFIG_REGISTRY: "https://registry.npmjs.org",
    npm_config_registry: "https://registry.npmjs.org",
  };
}

/**
 * Copies every candidate tarball into `vendor/` and points the manifest at them, directly and
 * through `overrides`, so that the remote `bun install --frozen-lockfile` resolves the candidate.
 * @param project - Project root.
 * @param tarballs - Candidate package names and their packed tarballs.
 * @returns Completion.
 */
export async function vendorCandidate(
  project: string,
  tarballs: readonly { readonly name: string; readonly path: string }[],
): Promise<void> {
  await mkdir(join(project, "vendor"), { recursive: true });
  const specifiers = new Map<string, string>();
  for (const { name, path } of tarballs) {
    await copyFile(path, join(project, "vendor", basename(path)));
    specifiers.set(name, `file:./vendor/${basename(path)}`);
  }
  const manifestPath = join(project, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
    string,
    Record<string, string> | string
  >;
  for (const section of ["dependencies", "devDependencies"] as const) {
    const entries = manifest[section];
    if (typeof entries !== "object") continue;
    for (const name of Object.keys(entries)) {
      const specifier = specifiers.get(name);
      if (specifier !== undefined) entries[name] = specifier;
    }
  }
  manifest.overrides = Object.fromEntries(specifiers);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
