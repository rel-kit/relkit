import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verifyPackedPostgresConsumer } from "./packed-postgres-consumer.js";
import { loadReleaseTarballs, readManifests } from "./pack-and-smoke-create-relkit-pack.js";
import { packAll } from "./release-check-artifacts.js";
import { checkManifests, command, packages, readJson, root } from "./release-check-support.js";

await command(process.execPath, ["run", "scripts/sync-release.ts"]);
const index = process.argv.indexOf("--artifacts");
const configured = index === -1 ? undefined : process.argv[index + 1];
if (index !== -1 && configured === undefined) throw new Error("--artifacts requires a directory");
const temporary = configured === undefined;
const directory =
  configured === undefined
    ? await mkdtemp(join(tmpdir(), "relkit-postgres-artifacts-"))
    : resolve(configured);
try {
  let tarballs: Map<string, string>;
  if (configured !== undefined) tarballs = await loadReleaseTarballs(directory);
  else {
    const items = await packages();
    const { version } = checkManifests(items, await readJson(join(root, "package.json")));
    const artifacts = await packAll(items, version, directory);
    tarballs = new Map(
      artifacts.map((artifact) => [String(artifact.name), join(directory, String(artifact.file))]),
    );
  }
  await verifyPackedPostgresConsumer(tarballs, await readManifests(root));
} finally {
  if (temporary) await rm(directory, { recursive: true, force: true });
}
