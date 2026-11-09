/**
 * Rehearses the beta release locally, publishing nothing: it versions the candidate from the
 * pending changesets (`<next>-beta.0`), builds and packs the release closure, rewrites the
 * archives to the beta version, serves them from a local candidate registry, applies the
 * release's deprecations the way `npm deprecate` would (the final `@relkit/app`), and runs the
 * creation, runtime and packed-consumer checks against that registry.
 *
 * Usage: `bun scripts/rehearse-beta.ts [--templates minimal,api] [--keep]`.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { packPackages, readManifests, startRegistry } from "./pack-and-smoke-create-relkit-pack.js";
import { betaVersion, reversionArchives } from "./rehearse-beta-pack.js";
import { creationSuite, legacyConsumerSuite, runtimeSuite } from "./rehearse-beta-suites.js";
import { releaseDeprecations } from "./release-deprecations.js";

const root = resolve(import.meta.dirname, "..");

/**
 * Fronts the candidate registry and adds each deprecated package's message to its version
 * metadata, which is what `npm deprecate` changes on npm.
 * @param upstream - Candidate registry port.
 * @returns The listening server.
 */
function deprecatingRegistry(upstream: number) {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const response = await fetch(`http://127.0.0.1:${upstream}${url.pathname}${url.search}`, {
        // Only content negotiation: the candidate registry checks its own host and port.
        headers: { accept: request.headers.get("accept") ?? "*/*" },
      });
      const name = decodeURIComponent(url.pathname.slice(1));
      const message = releaseDeprecations[name];
      if (message === undefined || !response.ok) return response;
      const document = (await response.json()) as { versions: Record<string, object> };
      for (const version of Object.keys(document.versions))
        document.versions[version] = { ...document.versions[version], deprecated: message };
      return Response.json(document);
    },
  });
}

/**
 * Runs the rehearsal.
 * @returns Nothing; throws on the first failing step.
 */
async function main(): Promise<void> {
  const option = process.argv.indexOf("--templates");
  const templates = (option < 0 ? "minimal,api" : process.argv[option + 1]!).split(",");
  const version = betaVersion();
  console.log(`Rehearsing ${version}: nothing is published.`);
  const temporary = await mkdtemp(join(tmpdir(), "relkit-beta-rehearsal-"));
  const manifests = await readManifests(root);
  let succeeded = false;
  const servers: { stop: (force?: boolean) => unknown }[] = [];
  try {
    const packed = await packPackages(temporary, manifests);
    const beta = await reversionArchives(packed, manifests, version, join(temporary, "beta"));
    const candidate = await startRegistry(temporary, beta.tarballs, beta.sources);
    servers.push(candidate);
    const registry = deprecatingRegistry(candidate.port!);
    servers.push(registry);
    const url = `http://127.0.0.1:${registry.port}`;
    const env = { ...process.env, BUN_CONFIG_REGISTRY: url, NPM_CONFIG_REGISTRY: url, CI: "1" };
    const port = 39_000 + Math.floor(Math.random() * 1_000);
    const created: string[] = [];
    for (const template of templates)
      created.push(await creationSuite(temporary, env, version, template));
    await runtimeSuite(created[0]!, env, port);
    await legacyConsumerSuite(
      created[0]!,
      temporary,
      env,
      version,
      releaseDeprecations["@relkit/app"]!,
      url,
    );
    succeeded = true;
    console.log(
      `Beta rehearsal passed for ${version}: ${templates.join(", ")} created, served on Bun and Node, and a project on the final @relkit/app built and migrated.`,
    );
  } finally {
    for (const server of servers) server.stop(true);
    if (succeeded && !process.argv.includes("--keep"))
      await rm(temporary, { recursive: true, force: true });
    else console.log(`Rehearsal files kept in ${temporary}`);
  }
}

if (import.meta.main) await main();
