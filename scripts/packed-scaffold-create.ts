/** Verifies certified public creation, post-install preparation and exact byte parity through the installed direct and relkit CLIs. */
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { realpath } from "node:fs/promises";
import { Effect, Schema } from "effect";
import { ScaffoldProcessFailure } from "./scaffold-process.errors.js";
import { PackedCreation } from "./packed-scaffold.schemas.js";
import { authoredProjectSnapshot } from "./scaffold-project-files.js";
import { verifyPackedMigration } from "./packed-scaffold-migration.js";
import { scaffoldNative } from "./scaffold-native.js";
import type { PackedCommand, PackedScaffoldFixture } from "./packed-scaffold.types.js";

/**
 * Creates one certified minimal application using its actual packed executable.
 * @param run - Captured finite command authority.
 * @param fixture - Exact installed generator and registry identity.
 * @param variant - Consumer path under test.
 * @param install - Whether creation itself installs and prepares.
 * @returns The schema-validated physical destination.
 */
const create = Effect.fn("PackedScaffold.create")(function* (
  run: PackedCommand,
  fixture: PackedScaffoldFixture,
  variant: string,
  install: boolean,
) {
  const directory = "minimal-" + variant + "-project";
  const text = yield* run({
    args: [
      variant === "cli" ? fixture.relkitBin : fixture.createBin,
      ...(variant === "cli" ? ["create"] : []),
      "minimal-app",
      "--directory",
      directory,
      "--template",
      "minimal",
      "--cloud",
      "none",
      "--deploy",
      "none",
      install ? "--install" : "--no-install",
      "--no-git",
      "--examples",
      "--json",
    ],
    cwd: fixture.temporary,
    registry: fixture.registry,
    cacheDir: fixture.cacheDir,
  });
  const output = text.trim().split(/\r?\n/).at(-1);
  assert.ok(output);
  const result = Schema.decodeUnknownSync(Schema.fromJsonString(PackedCreation))(output);
  const expected = yield* scaffoldNative("create.destination", () =>
    realpath(join(fixture.temporary, directory)),
  );
  assert.equal(result.destination, expected);
  return result.destination;
});

/**
 * Requires uncertified public tuples to fail before creating a destination.
 * @param run - Captured finite command authority.
 * @param fixture - Exact packed public CLI.
 * @returns Completion after native unsupported-template, jobs and cloud refusals.
 */
const rejectedTuples = Effect.fn("PackedScaffold.rejections")(function* (
  run: PackedCommand,
  fixture: PackedScaffoldFixture,
) {
  const tuples = [
    ["--template", "api"],
    ["--template", "agent"],
    ["--template", "fullstack"],
    ["--template", "minimal", "--jobs", "effect-mq-docker"],
    ["--template", "minimal", "--cloud", "aws", "--deploy", "pulumi"],
  ];
  for (const [index, tuple] of tuples.entries()) {
    const exit = yield* Effect.exit(
      run({
        args: [
          fixture.createBin,
          "rejected-" + index,
          ...tuple,
          "--no-install",
          "--no-git",
          "--json",
        ],
        cwd: fixture.temporary,
      }),
    );
    assert.equal(exit._tag, "Failure", "Uncertified tuple unexpectedly succeeded");
    if (exit._tag !== "Failure") continue;
    const reason = exit.cause.reasons[0];
    if (
      exit.cause.reasons.length !== 1 ||
      reason?._tag !== "Fail" ||
      !(reason.error instanceof ScaffoldProcessFailure)
    )
      return yield* Effect.failCause(exit.cause);
    assert.match(reason.error.message, /not certified/);
  }
});

/**
 * Compares direct and relkit creation, then verifies the no-install skill path after real installation.
 * @param run - Captured command authority.
 * @param fixture - Installed candidate identity.
 * @returns Both live consumer application roots; no-install creation is migrated and validated separately.
 */
export const createPackedScaffolds = Effect.fn("PackedScaffold.consumers")(function* (
  run: PackedCommand,
  fixture: PackedScaffoldFixture,
) {
  yield* rejectedTuples(run, fixture);
  const direct = yield* create(run, fixture, "tarball", true);
  const cli = yield* create(run, fixture, "cli", true);
  assert.deepEqual(yield* authoredProjectSnapshot(direct), yield* authoredProjectSnapshot(cli));
  for (const root of [direct, cli])
    for (const script of ["test", "build"]) yield* run({ args: ["run", script], cwd: root });
  const second = yield* create(run, fixture, "second", true);
  assert.deepEqual(yield* authoredProjectSnapshot(direct), yield* authoredProjectSnapshot(second));
  const deferred = yield* create(run, fixture, "post-install", false);
  yield* run({
    args: ["install", "--registry", fixture.registry],
    cwd: deferred,
    registry: fixture.registry,
    cacheDir: fixture.cacheDir,
  });
  yield* run({
    args: [fixture.relkitBin, "dev", "--prepare", "--project-root", deferred],
    cwd: deferred,
  });
  yield* run({
    args: ["install", "--frozen-lockfile", "--registry", fixture.registry],
    cwd: deferred,
    registry: fixture.registry,
    cacheDir: fixture.cacheDir,
  });
  yield* verifyPackedMigration(run, fixture, deferred);
  return [direct, cli] as const;
});
