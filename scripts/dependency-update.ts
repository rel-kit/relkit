/** Normalizes a Dependabot candidate in read-only CI and exports changed UTF-8 data on stdout for separate trusted admission. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Effect, Logger, Schema } from "effect";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";
import { automationCommand, prepareOperation } from "./pr-automation-io.js";
import {
  catalogReferences,
  catalogUpdates,
  dependencyUpdatePath,
} from "./dependency-update-policy.js";
import { DependencyManifest } from "./dependency-update.schemas.js";
import type { ManifestChange } from "./dependency-update.types.js";

const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(DependencyManifest));

/**
 * Restores archived evidence and promotes active manifest pins into their catalog owner.
 * @param root - Isolated, credential-free candidate checkout.
 * @param base - Validated base commit SHA.
 * @param signal - Owning CI cancellation signal.
 * @returns Completion after the authoritative root manifest is written.
 */
export async function normalizeDependencies(
  root: string,
  base: string,
  signal: AbortSignal,
): Promise<void> {
  assert.match(base, /^[a-f0-9]{40}$/);
  const git = (args: readonly string[]) => automationCommand("git", args, root, signal);
  const ancestor = (await git(["merge-base", base, "HEAD"])).trim();
  const paths = (await git(["diff", "--no-renames", "--name-only", "-z", `${ancestor}..HEAD`]))
    .split("\0")
    .filter(Boolean);
  const original = manifest(await git(["show", `${ancestor}:package.json`]));
  const current = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))(
    await readFile(resolve(root, "package.json"), "utf8"),
  );
  const head = Schema.decodeUnknownSync(DependencyManifest)(current);
  const changes: ManifestChange[] = [{ before: original, after: head }];
  const writes = [];
  for (const path of paths.filter((path) => path.endsWith("/package.json"))) {
    const before = await git(["show", `${ancestor}:${path}`]);
    if (path.startsWith("openspec/changes/archive/")) {
      writes.push({ path, content: before });
    } else if (dependencyUpdatePath(path)) {
      const raw = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))(
        await readFile(resolve(root, path), "utf8"),
      );
      const change = {
        before: manifest(before),
        after: Schema.decodeUnknownSync(DependencyManifest)(raw),
      };
      changes.push(change);
      writes.push({
        path,
        content:
          JSON.stringify({ ...raw, ...catalogReferences(change.before, change.after) }, null, 2) +
          "\n",
      });
    }
  }
  const catalog = catalogUpdates(original.catalog ?? {}, head.catalog ?? {}, changes);
  for (const write of writes) await writeFile(resolve(root, write.path), write.content);
  await writeFile(
    resolve(root, "package.json"),
    JSON.stringify({ ...current, ...catalogReferences(original, head), catalog }, null, 2) + "\n",
  );
}

/**
 * Exports tracked modifications without tar extraction or executable transport.
 * @param root - Candidate checkout after frozen-install and sync validation.
 * @param signal - Owning CI cancellation signal.
 * @returns Completion after the head-bound JSON data is emitted to stdout.
 */
async function exportDependencies(root: string, signal: AbortSignal): Promise<void> {
  const head = (await automationCommand("git", ["rev-parse", "HEAD"], root, signal)).trim();
  const paths = (
    await automationCommand("git", ["diff", "--name-only", "-z", "HEAD"], root, signal)
  )
    .split("\0")
    .filter(Boolean);
  const files = [];
  for (const path of paths) {
    assert.ok(
      dependencyUpdatePath(path) || /^openspec\/changes\/archive\/.+\/package\.json$/.test(path),
      `Unexpected generated path: ${path}`,
    );
    files.push({ path, content: await readFile(resolve(root, path), "utf8") });
  }
  console.log(JSON.stringify({ repository: process.env.GITHUB_REPOSITORY, head, files }));
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const program = Effect.gen(function* () {
    if (process.argv[2] === "--export") {
      yield* prepareOperation("dependency.export", (signal) => exportDependencies(root, signal));
    } else {
      yield* prepareOperation("dependency.normalize", (signal) =>
        normalizeDependencies(root, process.env.PR_BASE_SHA ?? "", signal),
      );
    }
    yield* Effect.logInfo("Dependency preparation completed");
  });
  await runBenchmarkMain(program.pipe(Effect.provideService(Logger.LogToStderr, true)));
}
