/** Checks actual lightweight wrapper output, isolated installation and byte-identical no-install creation. */
import { strict as assert } from "node:assert";
import { readFile, realpath, readdir } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { Effect, Schema } from "effect";
import { snapshotProject } from "./pack-and-smoke-create-relkit-support.js";
import { packedWrapperCommand } from "./packed-wrapper-command.js";
import { wrapperCreatorPrefix } from "./packed-wrapper-fixture.js";
import type { PackedWrapperContext, PackedWrapperRunner } from "./packed-wrapper.types.js";

const Manifest = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.String,
    version: Schema.String,
    dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    devDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
);
const Creation = Schema.fromJsonString(Schema.Struct({ destination: Schema.String }));
const ProjectManifest = Schema.fromJsonString(
  Schema.Struct({ devDependencies: Schema.Record(Schema.String, Schema.String) }),
);

/** Requires own plain help/version and a project-local CLI failure without installing or mutating the project. */
export const checkWrapperRunner = Effect.fn("PackedWrapper.runner")(function* (
  context: PackedWrapperContext,
  runner: PackedWrapperRunner,
) {
  const command = { executable: runner.executable, cwd: context.consumer, env: context.env };
  const help = yield* packedWrapperCommand({ ...command, args: [...runner.prefix, "--help"] });
  assert.match(help.stdout, /^Usage: relkit create /);
  assert.match(help.stdout, /requires the project @relkit\/cli/);
  const version = yield* packedWrapperCommand({
    ...command,
    args: [...runner.prefix, "--version"],
  });
  assert.equal(version.stdout.trim(), context.wrapperVersion);
  const before = yield* Effect.promise(() => snapshotProject(context.consumer));
  const missing = yield* packedWrapperCommand(
    { ...command, args: [...runner.prefix, "check", "--json"] },
    1,
  );
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /RELKIT_PROJECT_CLI_REQUIRED/);
  assert.deepEqual(yield* Effect.promise(() => snapshotProject(context.consumer)), before);
  return help.stdout;
});

/** Verifies actual transient package identity, exact creator dependency and absence of any installed CLI. */
export async function checkWrapperInstallation(
  context: PackedWrapperContext,
  runner: PackedWrapperRunner,
) {
  const packages = [
    ...new Bun.Glob("**/node_modules/relkit/package.json").scanSync({
      cwd: runner.cache,
      absolute: true,
      dot: true,
    }),
  ];
  assert.ok(packages.length > 0, `${runner.name} did not install its candidate wrapper`);
  for (const path of packages) {
    const physical = await realpath(path),
      child = relative(await realpath(context.temporary), physical);
    assert.ok(
      child !== ".." && !child.startsWith("../") && !isAbsolute(child),
      "Runner escaped its fixture",
    );
    const manifest = Schema.decodeUnknownSync(Manifest)(await readFile(physical, "utf8"));
    assert.equal(manifest.name, "relkit");
    assert.equal(manifest.version, context.wrapperVersion);
    assert.deepEqual(manifest.dependencies, { "create-relkit": context.creatorVersion });
  }
  assert.deepEqual(
    [
      ...new Bun.Glob("**/node_modules/@relkit/cli/package.json").scanSync({
        cwd: runner.cache,
        dot: true,
      }),
    ],
    [],
  );
  const first = packages[0];
  assert.ok(first);
  return join(first, "../dist/bin.js");
}

/** Creates the same project through each actual runner and compares selected output without installing project dependencies. */
export const checkWrapperCreation = Effect.fn("PackedWrapper.creation")(function* (
  context: PackedWrapperContext,
  runner: PackedWrapperRunner,
  direct = false,
) {
  const destination = join(context.consumer, `${runner.name}-${direct ? "creator" : "wrapper"}`);
  const prefix = direct ? wrapperCreatorPrefix(context, runner) : [...runner.prefix, "create"];
  const output = yield* packedWrapperCommand({
    executable: runner.executable,
    cwd: context.consumer,
    env: context.env,
    args: [
      ...prefix,
      "alias-app",
      "--directory",
      destination,
      "--template",
      "minimal",
      "--cloud",
      "none",
      "--deploy",
      "none",
      "--no-install",
      "--no-git",
      "--json",
    ],
  });
  assert.equal(Schema.decodeUnknownSync(Creation)(output.stdout).destination, destination);
  const manifest = Schema.decodeUnknownSync(ProjectManifest)(
    yield* Effect.promise(() => readFile(join(destination, "package.json"), "utf8")),
  );
  assert.equal(manifest.devDependencies["@relkit/cli"], context.cliVersion);
  const files = yield* Effect.promise(() => readdir(destination));
  for (const absent of ["node_modules", "bun.lock", "package-lock.json", ".git"])
    assert.ok(!files.includes(absent));
  return yield* Effect.promise(() => snapshotProject(destination));
});
