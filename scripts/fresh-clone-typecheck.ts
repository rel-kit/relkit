/**
 * Fresh-clone type-check for one template, using the creator packed from this checkout: creates the
 * template with installation from a local registry, commits it, clones the commit into an empty
 * directory, installs there and runs the project's `typecheck` script (`tsc --noEmit`). The clone
 * has no `.relkit` output and no earlier `relkit check` or `relkit dev`, so the project must type-check
 * from what git carries plus the installed packages.
 *
 *   bun scripts/fresh-clone-typecheck.ts --template api
 */
import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CREATE_TEMPLATES } from "create-relkit";
import { Effect } from "effect";
import { preparePackedFixture } from "./dev-readiness/packed-fixture.js";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";
import { runCommand } from "./pack-and-smoke-create-relkit-support.js";

const root = resolve(import.meta.dir, "..");

/** Runs git with a fixed identity so the commit needs no global configuration. */
function git(cwd: string, ...args: string[]): void {
  const child = Bun.spawnSync(
    ["git", "-c", "user.name=relkit-ci", "-c", "user.email=ci@relkit.invalid", ...args],
    { cwd, stdout: "inherit", stderr: "inherit" },
  );
  if (child.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}`);
}

/** Requires the committed generated type files to carry no path of the machine that created them. */
async function requirePortableGeneratedFiles(clone: string, machineRoot: string): Promise<void> {
  const tracked = ["route-module-checks.ts", "context-registry.d.ts"].map(
    (name) => `.relkit/generated/${name}`,
  );
  for (const file of tracked) {
    const text = await readFile(join(clone, file), "utf8");
    if (text.includes(machineRoot)) throw new Error(`${file} contains a machine-specific path`);
  }
}

const main = Effect.fn("FreshCloneTypecheck.main")(function* () {
  const index = process.argv.indexOf("--template");
  const requested = index < 0 ? undefined : process.argv[index + 1];
  const template = CREATE_TEMPLATES.find((value) => value === requested);
  if (template === undefined)
    return yield* Effect.die(new Error(`--template must be one of: ${CREATE_TEMPLATES.join("|")}`));
  const fixture = yield* preparePackedFixture(root, "examples", undefined, template);
  const cache = join(fixture.temporary, "cache");
  const clone = join(fixture.temporary, "fresh-clone");
  try {
    yield* Effect.promise(async () => {
      git(fixture.projectRoot, "init", "--quiet", "--initial-branch", "main");
      git(fixture.projectRoot, "add", "--all");
      git(
        fixture.projectRoot,
        "commit",
        "--quiet",
        "--message",
        "Created from the packed candidate",
      );
      git(fixture.temporary, "clone", "--quiet", "--no-hardlinks", fixture.projectRoot, clone);
      await requirePortableGeneratedFiles(clone, fixture.temporary);
      await runCommand(["install", "--registry", fixture.registry], clone, fixture.registry, cache);
      await runCommand(["run", "typecheck"], clone, fixture.registry, cache);
    });
    console.log(`${template}: a fresh clone installs and type-checks`);
  } finally {
    yield* Effect.promise(() => rm(fixture.temporary, { recursive: true, force: true }));
  }
});

if (import.meta.main) await runBenchmarkMain(Effect.scoped(main()));
