/**
 * Verifies the provider starter (`templates/provider-starter`) the way an author uses it: packs
 * this checkout, creates an `api` app from the packed generator, copies the starter beside it with
 * the packed RelKit versions, installs it, runs its tests, builds and packs it, then installs the
 * packed starter into the app, selects it as the app's cache and runs `relkit check`, the
 * typecheck, the app's tests and a production build, and starts the built server until it reports
 * ready, which needs the starter's runtime entry to create the cache provider.
 *
 *   bun scripts/pack-and-smoke-provider-starter.ts [--artifacts <packed release directory>]
 */
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { preparePackedFixture } from "./dev-readiness/packed-fixture.js";
import { readPackedManifest } from "./pack-and-smoke-create-relkit-pack.js";
import { runCommand } from "./pack-and-smoke-create-relkit-support.js";

const root = resolve(import.meta.dir, "..");
const index = process.argv.indexOf("--artifacts");
const artifacts = index === -1 ? undefined : process.argv[index + 1];

await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = yield* preparePackedFixture(root, "examples", artifacts, "api");
      yield* Effect.promise(() => verifyStarter(fixture));
    }),
  ),
);

/**
 * Runs the starter and app steps against the fixture's registry.
 * @param fixture - Packed registry, its artifacts and the created api app.
 */
async function verifyStarter(fixture: {
  readonly temporary: string;
  readonly projectRoot: string;
  readonly registry: string;
  readonly artifacts: readonly { readonly name: string; readonly path: string }[];
}): Promise<void> {
  const { registry, projectRoot: app } = fixture;
  const cache = join(fixture.temporary, "starter-cache");
  const starter = join(fixture.temporary, "relkit-provider-starter");
  await cp(join(root, "templates/provider-starter"), starter, { recursive: true });
  const versions = new Map<string, string>();
  for (const artifact of fixture.artifacts)
    if (artifact.name === "relkit" || artifact.name === "@relkit/testing")
      versions.set(artifact.name, String((await readPackedManifest(artifact.path)).version));
  const manifestPath = join(starter, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
    string,
    Record<string, string>
  >;
  for (const field of ["peerDependencies", "devDependencies"])
    for (const name of Object.keys(manifest[field] ?? {}))
      if (versions.has(name)) manifest[field]![name] = versions.get(name)!;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const step = async (label: string, args: string[], cwd: string) => {
    const output = await runCommand(args, cwd, registry, cache);
    console.log(`passed: ${label}`);
    return output;
  };
  await step("starter install", ["install", "--registry", registry], starter);
  console.log((await step("starter tests", ["test"], starter)).trim());
  await step("starter typecheck", ["run", "typecheck"], starter);
  await step("starter pack", ["pm", "pack", "--destination", fixture.temporary], starter);
  const tarball = (await readdir(fixture.temporary)).find((name) =>
    name.startsWith("relkit-provider-starter-"),
  );
  if (tarball === undefined) throw new Error("bun pm pack wrote no starter tarball");
  await step(
    "install into the api app",
    ["add", join(fixture.temporary, tarball), "--registry", registry],
    app,
  );
  await selectStarterCache(app);
  await step("relkit check", ["x", "--no-install", "relkit", "check"], app);
  await step("app typecheck", ["run", "typecheck"], app);
  await step("app tests", ["test"], app);
  await step("relkit build", ["x", "--no-install", "relkit", "build"], app);
  await serveReady(app);
  console.log(
    `Provider starter passed (relkit ${versions.get("relkit")}, @relkit/testing ${versions.get("@relkit/testing")}).`,
  );
}

/**
 * Selects the starter as the app's cache: a `memory` profile, the default cache profile and a
 * cache definition that uses it.
 * @param app - App root.
 */
async function selectStarterCache(app: string): Promise<void> {
  const configPath = join(app, "relkit.config.ts");
  const config = await readFile(configPath, "utf8");
  const updated = config
    .replace(
      'import { defineApp } from "relkit/config";',
      'import { defineApp } from "relkit/config";\nimport { starterCache } from "relkit-provider-starter";',
    )
    .replace(
      "export default defineApp({\n",
      'export default defineApp({\n  cache: { memory: starterCache({ maxEntries: 100 }) },\n  defaults: { cache: "memory" },\n',
    );
  if (updated === config || !updated.includes("starterCache({"))
    throw new Error("The api template's relkit.config.ts changed shape; update this script.");
  await writeFile(configPath, updated);
  await mkdir(join(app, "src/services/orders/cache"), { recursive: true });
  await writeFile(
    join(app, "src/services/orders/cache/greetings.cache.ts"),
    [
      'import { defineCache } from "relkit/cache";',
      'import { z } from "zod";',
      "",
      "export default defineCache({",
      '  id: "orders.greetings",',
      '  profile: "memory",',
      "  key: z.object({ name: z.string() }),",
      "  value: z.string(),",
      "  defaultTtlMs: 60_000,",
      "});",
      "",
    ].join("\n"),
  );
}

/**
 * Starts the built server and waits for readiness, which includes every provider's `ready`.
 * @param app - App root with a production build.
 */
async function serveReady(app: string): Promise<void> {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = probe.port ?? 0;
  await probe.stop(true);
  const server = await readFile(join(app, ".relkit/build/server/index.js"), "utf8");
  if (!server.includes("relkit-provider-starter/runtime"))
    throw new Error("The built server does not load the starter's runtime entry.");
  const child = Bun.spawn(
    [process.execPath, "run", "--no-env-file", ".relkit/build/server/index.js"],
    {
      cwd: app,
      env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  try {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`The server exited with ${child.exitCode}.`);
      const response = await fetch(`http://127.0.0.1:${port}/_relkit/v1/health/ready`).catch(
        () => undefined,
      );
      if (response?.status === 200) {
        console.log(`passed: server ready with the starter cache (${await response.text()})`);
        return;
      }
      await Bun.sleep(250);
    }
    throw new Error("The server was not ready within 60 seconds.");
  } finally {
    child.kill();
    await child.exited;
  }
}
