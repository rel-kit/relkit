/**
 * Prepares the newcomer project the Cloudflare deploy test ships: the `api` template created from
 * the packed candidate, Postgres jobs and events added with `relkit add`, `@relkit/cloudflare` with
 * Durable Object realtime, the probe service of the Railway and Vercel tests plus a public channel,
 * and a first `relkit build --runtime workers`. The candidate's tarballs are vendored into the
 * project, because wrangler bundles from the project's own `node_modules`. The flow names the
 * Worker and runs `relkit deploy init cloudflare` once the run ID is known.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { preparePackedFixture } from "../dev-readiness/packed-fixture.js";
import { PROBE_FILES } from "../railway-newcomer/probe-sources.js";
import { run, vendorCandidate } from "../railway-newcomer/project.js";

/** A prepared project and the temporary directory to remove afterwards. */
export interface CloudflareNewcomerProject {
  readonly projectRoot: string;
  readonly temporary: string;
}

/** The public channel that makes the Worker use its Durable Object for realtime. */
const CHANNEL = `/** A public channel; its realtime profile lives in a Durable Object on Cloudflare. */
import { defineChannel } from "relkit/realtime";
import { z } from "zod";

export default defineChannel({
  id: "probe.feed",
  params: z.object({}),
  events: { posted: z.object({ key: z.string() }) },
  client: { public: true },
});
`;

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
export async function prepareCloudflareNewcomerProject(
  repository: string,
  artifacts?: string,
): Promise<CloudflareNewcomerProject> {
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
          await run([process.execPath, "add", "@relkit/cloudflare"], project, registry);
          for (const [path, content] of Object.entries({
            ...PROBE_FILES,
            "src/services/probe/channels/feed.channel.ts": CHANNEL,
          })) {
            await mkdir(join(project, path, ".."), { recursive: true });
            await writeFile(join(project, path), content);
          }
          await useDurableObjectRealtime(project);
          await includeEventRegistry(project);
          await vendorCandidate(project, fixture.artifacts);
          await rm(join(project, "bun.lock"), { force: true });
          await rm(join(project, "node_modules"), { recursive: true, force: true });
          await run([process.execPath, "install"], project, PUBLIC_REGISTRY);
          await run([relkit, "check"], project);
        });
        return { projectRoot: project, temporary: fixture.temporary };
      }),
    ),
  );
}

/**
 * Selects Durable Object realtime for the default profile in `relkit.config.ts`.
 * @param project - Project root.
 * @returns Completion.
 */
async function useDurableObjectRealtime(project: string): Promise<void> {
  const path = join(project, "relkit.config.ts");
  const source = await readFile(path, "utf8");
  const opening = "export default defineApp({\n";
  if (!source.includes(opening))
    throw new Error("relkit.config.ts has no defineApp call to extend");
  await writeFile(
    path,
    `import { durableObjectRealtime } from "@relkit/cloudflare";\n${source.replace(
      opening,
      `${opening}  realtime: { default: durableObjectRealtime({ binding: "RELKIT_REALTIME" }) },\n`,
    )}`,
  );
}

/**
 * Adds the generated event registry to the type-checked files, which event functions need.
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
