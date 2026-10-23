/** Exercises lightweight wrapper archives through isolated native Bun/npm runners without an installed application CLI. */
import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { startRegistry } from "./pack-and-smoke-create-relkit-pack.js";
import { wrapperArchiveInputs } from "./packed-wrapper-archives.js";
import { packedWrapperCommand } from "./packed-wrapper-command.js";
import {
  checkWrapperCreation,
  checkWrapperInstallation,
  checkWrapperRunner,
} from "./packed-wrapper-checks.js";
import { wrapperContext, wrapperCreatorPrefix, wrapperRunners } from "./packed-wrapper-fixture.js";
import type { ProjectSnapshot } from "./scaffold-process.types.js";

/** Uses only candidate creator-runtime archives; selected project-local CLI delegation is covered by owning C1 tests. */
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
    wrapperContext(
      temporary,
      `http://127.0.0.1:${server.port}`,
      input.wrapperVersion,
      input.creatorVersion,
      input.cliVersion,
    ),
  );
  const npmVersion = yield* packedWrapperCommand({
    executable: "node",
    args: [context.npmScript, "--version"],
    cwd: context.consumer,
    env: context.env,
  });
  assert.equal(npmVersion.stdout.trim(), context.npmVersion);
  yield* seedRunnerCaches(context);
  yield* Effect.promise(() => server.stop(true));
  yield* checkRunners(context);
  console.log(
    `Packed wrapper passed: Bun ${process.versions.bun}, npm ${context.npmVersion}; creator-only archives, own help/version, missing CLI, no-install creation parity.`,
  );
});

/** Runs package-manager paths serially and checks installed wrapper execution separately from binary selection. */
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
  assert.equal(
    (yield* packedWrapperCommand({
      args: ["x", "--no-install", "relkit", "--version"],
      cwd: context.consumer,
      env: context.env,
    })).stdout.trim(),
    context.wrapperVersion,
  );
});

/** Primes only candidate wrapper/creator closures before disabling the registry for offline runner assertions. */
const seedRunnerCaches = Effect.fn("PackedWrapper.seed")(function* (
  context: Awaited<ReturnType<typeof wrapperContext>>,
) {
  for (const runner of wrapperRunners(context))
    for (const direct of [false, true]) {
      const prefix = direct ? wrapperCreatorPrefix(context, runner) : runner.prefix;
      const output = yield* packedWrapperCommand(
        {
          executable: runner.executable,
          cwd: context.consumer,
          env: context.env,
          args: [
            ...prefix.filter((part) => part !== "--offline" && part !== "--no-install"),
            "--help",
          ],
        },
        direct ? 2 : 0,
      );
      if (direct) assert.match(output.stderr, /RELKIT_CREATE_USAGE: Unknown create option: --help/);
    }
  for (const specifier of ["relkit", "relkit@latest"])
    assert.equal(
      (yield* packedWrapperCommand({
        args: ["x", specifier, "--version"],
        cwd: context.consumer,
        env: context.env,
      })).stdout.trim(),
      context.wrapperVersion,
    );
});

/** Checks actual candidate archives after joining every owned runner and registry resource. */
export function smokePackedRelkit(artifacts: string): Promise<void> {
  return Effect.runPromise(wrapperSmoke(artifacts).pipe(Effect.scoped));
}

if (import.meta.main) {
  const index = process.argv.indexOf("--artifacts"),
    directory = index === -1 ? undefined : process.argv[index + 1];
  if (directory === undefined) throw new Error("--artifacts requires a release manifest directory");
  await smokePackedRelkit(resolve(directory));
}
