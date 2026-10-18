/** Uses the existing rollback-safe certification driver with serial incremental builds and reused candidate archives. */
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { certifyCreation } from "../../../../../scripts/certify-create.ts";
import { templateDigest } from "../../../../../scripts/release-create-evidence.ts";
import { packAll } from "../../../../../scripts/release-check-artifacts.ts";
import { command, packages } from "../../../../../scripts/release-check-support.ts";
import { CREATE_CAPABILITY_TABLE, currentCreateCapabilityIdentity } from "../../../../../packages/create-relkit/src/create-capabilities.ts";
import { repository, requireHeadroom } from "./packed-support.ts";

process.env.NODE_OPTIONS = "--max-old-space-size=512";
process.env.BUN_CONFIG_MAX_HTTP_REQUESTS = "1";
process.env.NEXT_TELEMETRY_DISABLED = "1";
process.env.RELKIT_DOCGEN_CONCURRENCY = "1";
assert.equal(process.env.RELKIT_INSPECTOR_ROOT, undefined);
const previous = CREATE_CAPABILITY_TABLE.entries[0]!;
const entry = { ...previous, identity: currentCreateCapabilityIdentity(), templateDigest: await templateDigest(join(repository, "templates/default/v1/minimal")) };
const original = join(import.meta.dir, "previous-certification");
await mkdir(original, { recursive: true });
for (const [name, path] of [["capability-source.ts", "packages/create-relkit/src/create-capabilities.ts"], ["fresh.json", previous.freshEvidence], ["restart.json", previous.restartEvidence]])
  await copyFile(join(repository, path!), join(original, name!));
const archives = await mkdtemp(join(tmpdir(), "relkit-certified-artifacts-"));
const steps: unknown[] = [];
let measured = false;
async function execute(args: string[]) {
  await requireHeadroom();
  const started = Date.now();
  try {
    const output = await command(process.execPath, ["--smol", ...args], repository, 1_800_000);
    steps.push({ args, passed: true, ms: Date.now() - started });
    await writeFile(join(import.meta.dir, `certification-step-${steps.length}.log`), output);
  } catch (error) {
    steps.push({ args, passed: false, error: String(error), ms: Date.now() - started });
    throw error;
  } finally {
    await writeFile(join(import.meta.dir, "certification-steps.json"), JSON.stringify(steps, null, 2) + "\n");
  }
}
try {
  await certifyCreation(repository, entry, async (args) => {
    if (args.includes("turbo")) {
      // Product changes are confined to these two packages. Other archives reuse unchanged compiled files.
      await requireHeadroom();
      await command("node", ["--max-old-space-size=512", "node_modules/typescript/bin/tsc", "-b", "packages/create-relkit", "packages/cli", "--pretty", "false"], repository, 180_000);
      await execute(["scripts/package-create-relkit-templates.ts"]);
      const artifacts = await packAll(await packages(), entry.identity.release, archives);
      await writeFile(join(archives, "manifest.json"), JSON.stringify({ packages: artifacts }, null, 2));
      await writeFile(join(import.meta.dir, "certified-artifacts.json"), JSON.stringify({ directory: archives, packages: artifacts }, null, 2) + "\n");
      return;
    }
    if (args[0] === "scripts/benchmark-packed-dev.ts") {
      const set = args[args.indexOf("--set") + 1]!;
      await execute([...args, "--artifacts", archives]);
      await copyFile(args[args.indexOf("--output") + 1]!, join(import.meta.dir, `certification-${set}.json`));
      return;
    }
    if (args.includes("vitest")) args.push("--maxWorkers=1");
    await execute(args);
  });
  measured = true;
} finally {
  // Failed certification restores source; refresh its compiled assets before any later consumer.
  if (!measured) {
    await command("node", ["--max-old-space-size=512", "node_modules/typescript/bin/tsc", "-p", "packages/create-relkit/tsconfig.json", "--pretty", "false"], repository, 60_000);
    await command(process.execPath, ["--smol", "scripts/package-create-relkit-templates.ts"], repository, 60_000);
  }
  await rm(archives, { recursive: true, force: true });
  await writeFile(join(import.meta.dir, "certification-result.json"), JSON.stringify({ measured, entry, archivesRemoved: true }, null, 2) + "\n");
}
