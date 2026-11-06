/**
 * Smokes the packed `relkit` core package and launcher through isolated Bun and npm runners:
 * `relkit --version`, its help and missing-CLI failure, `relkit create` through the packed
 * `create-relkit`, and `relkit check` on the created app. Every first-party package comes from the
 * candidate archives; the fixture registry rejects a first-party name it was not given.
 */
import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { startRegistry } from "./pack-and-smoke-create-relkit-pack.js";
import { wrapperArchiveInputs } from "./packed-wrapper-archives.js";
import { packedWrapperCommand } from "./packed-wrapper-command.js";
import {
  checkCreatedProject,
  checkWrapperCreation,
  checkWrapperInstallation,
  checkWrapperRunner,
} from "./packed-wrapper-checks.js";
import { wrapperContext, wrapperRunners } from "./packed-wrapper-fixture.js";
import type { ProjectSnapshot } from "./scaffold-process.types.js";

const wrapperSmoke = Effect.fn("PackedWrapper.smoke")(function* (artifacts: string) {
  const temporary = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-wrapper-smoke-"))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  );
  const input = yield* Effect.promise(() => wrapperArchiveInputs(artifacts));
  const server = yield* Effect.acquireRelease(
    Effect.promise(() => startRegistry(temporary, input.selected, input.manifests)),
    (server) => Effect.promise(() => server.stop(true)),
  );
  const context = yield* Effect.promise(() =>
    wrapperContext(temporary, `http://127.0.0.1:${server.port}`, input),
  );
  const npmVersion = yield* packedWrapperCommand({
    executable: "node",
    args: [context.npmScript, "--version"],
    cwd: context.consumer,
    env: context.env,
  });
  assert.equal(npmVersion.stdout.trim(), context.npmVersion);
  yield* checkRunners(context);
  const bun = wrapperRunners(context).find((runner) => runner.name === "bun");
  assert.ok(bun);
  yield* checkCreatedProject(context, bun);
  console.log(
    `Packed relkit passed: Bun ${process.versions.bun}, npm ${context.npmVersion}; runtime closure ${input.runtime.join(", ")}; version, help, missing CLI, creation parity, create and check.`,
  );
});

/** Runs each package runner serially: own output, installed closure and identical no-install creation. */
const checkRunners = Effect.fn("PackedWrapper.runners")(function* (
  context: Awaited<ReturnType<typeof wrapperContext>>,
) {
  let baseline: ProjectSnapshot | undefined;
  for (const runner of wrapperRunners(context)) {
    const help = yield* checkWrapperRunner(context, runner);
    const binary = yield* Effect.promise(() => checkWrapperInstallation(context, runner));
    const direct = yield* packedWrapperCommand({
      args: [binary, "--help"],
      cwd: context.consumer,
      env: context.env,
    });
    assert.equal(direct.stdout, help);
    for (const useCreator of [false, true]) {
      const snapshot = yield* checkWrapperCreation(context, runner, useCreator);
      if (baseline === undefined) baseline = snapshot;
      else assert.deepEqual(snapshot, baseline);
    }
    yield* Effect.promise(() => checkWrapperInstallation(context, runner));
  }
});

/** Checks the candidate archives listed in a release manifest directory.
 * @param artifacts - Directory holding the release `manifest.json` and its archives.
 */
export function smokePackedRelkit(artifacts: string): Promise<void> {
  return Effect.runPromise(wrapperSmoke(artifacts).pipe(Effect.scoped));
}

if (import.meta.main) {
  const index = process.argv.indexOf("--artifacts"),
    directory = index === -1 ? undefined : process.argv[index + 1];
  if (directory === undefined) throw new Error("--artifacts requires a release manifest directory");
  await smokePackedRelkit(resolve(directory));
}
