/**
 * Packs every release package and runs the published `@relkit/testing` conformance suites from
 * the packed packages against first-party providers in a standalone consumer. Needs a Redis server
 * (REDIS_URL) and a Postgres server (RELKIT_TEST_POSTGRES_URL); `--artifacts <dir>` reuses
 * tarballs from an earlier `release:pack`.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadReleaseTarballs, readManifests } from "./pack-and-smoke-create-relkit-pack.js";
import { verifyPackedProviderConformance } from "./packed-provider-conformance.js";
import { packAll } from "./release-check-artifacts.js";
import { checkManifests, command, packages, readJson, root } from "./release-check-support.js";

const redisUrl = process.env.REDIS_URL;
const postgresUrl = process.env.RELKIT_TEST_POSTGRES_URL;
if (redisUrl === undefined || postgresUrl === undefined)
  throw new Error(
    "Set REDIS_URL and RELKIT_TEST_POSTGRES_URL to run the packed conformance suites.",
  );
await command(process.execPath, ["run", "scripts/sync-release.ts"]);
const index = process.argv.indexOf("--artifacts");
const configured = index === -1 ? undefined : process.argv[index + 1];
if (index !== -1 && configured === undefined) throw new Error("--artifacts requires a directory");
const directory =
  configured === undefined
    ? await mkdtemp(join(tmpdir(), "relkit-conformance-artifacts-"))
    : resolve(configured);
try {
  let tarballs: Map<string, string>;
  if (configured !== undefined) tarballs = await loadReleaseTarballs(directory);
  else {
    const items = await packages();
    checkManifests(items, await readJson(join(root, "package.json")));
    const artifacts = await packAll(items, directory);
    tarballs = new Map(
      artifacts.map((artifact) => [String(artifact.name), join(directory, String(artifact.file))]),
    );
  }
  await verifyPackedProviderConformance(tarballs, await readManifests(root), {
    redisUrl,
    postgresUrl,
    node: process.env.RELKIT_TEST_NODE ?? "node",
  });
} finally {
  if (configured === undefined) await rm(directory, { recursive: true, force: true });
}
