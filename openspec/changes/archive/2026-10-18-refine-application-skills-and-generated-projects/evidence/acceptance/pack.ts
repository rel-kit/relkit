/** Reuses existing release packing/listing checks against already compiled candidate files. */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packAll } from "../../../../../scripts/release-check-artifacts.ts";
import {
  packages,
  checkManifests,
  readJson,
  root,
} from "../../../../../scripts/release-check-support.ts";

const temporary = await mkdtemp(join(tmpdir(), "relkit-acceptance-artifacts-"));
let passed = false;
try {
  const items = await packages();
  const { version } = checkManifests(items, await readJson(join(root, "package.json")));
  const artifacts = await packAll(items, version, temporary);
  await writeFile(
    join(temporary, "manifest.json"),
    JSON.stringify({ packages: artifacts }, null, 2),
  );
  await writeFile(
    join(import.meta.dir, "artifacts.json"),
    JSON.stringify({ directory: temporary, version, packages: artifacts }, null, 2) + "\n",
  );
  passed = true;
  console.log(`Verified ${artifacts.length} candidate archives in ${temporary}`);
} finally {
  if (!passed) await rm(temporary, { recursive: true, force: true });
}
