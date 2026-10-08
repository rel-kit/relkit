import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  loadReleaseTarballs,
  readManifests,
  readPackedManifest,
  startRegistry,
} from "./pack-and-smoke-create-relkit-pack.js";
import { snapshotProject } from "./pack-and-smoke-create-relkit-support.js";

/** Exercises the published command from an empty directory and isolated Bun cache.
 * @param artifacts - Release manifest directory containing validated package archives.
 * @returns After bare, latest, and pinned invocations preserve CLI behavior.
 */
export async function smokePackedRelkit(artifacts: string): Promise<void> {
  const root = resolve(import.meta.dir, "..");
  const temporary = await mkdtemp(join(tmpdir(), "relkit-bunx-smoke-"));
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    const manifests = await readManifests(root);
    const tarballs = await loadReleaseTarballs(artifacts);
    const wrapper = tarballs.get("relkit");
    assert.ok(wrapper, "Release artifacts do not include relkit");
    const packed = await readPackedManifest(wrapper);
    assert.equal(packed.dependencies?.["@relkit/cli"], packed.version);
    server = await startRegistry(temporary, tarballs, manifests);
    const registry = `http://127.0.0.1:${server.port!}`;
    const consumer = join(temporary, "consumer");
    const tools = join(temporary, "tools");
    const bunxTemporary = join(temporary, "tmp");
    await mkdir(consumer);
    await mkdir(tools);
    await mkdir(bunxTemporary);
    await symlink(process.execPath, join(tools, "bun"));
    const environment = {
      ...process.env,
      // Exclude global relkit installations and repository node_modules/.bin.
      PATH: `${tools}:/usr/bin:/bin`,
      BUN_INSTALL_CACHE_DIR: join(temporary, "cache"),
      BUN_TMPDIR: bunxTemporary,
      TMPDIR: bunxTemporary,
      TEMP: bunxTemporary,
      BUN_CONFIG_REGISTRY: registry,
      npm_config_registry: registry,
    };
    const execute = async (args: string[], expectedCode = 0): Promise<string> => {
      const child = Bun.spawn([process.execPath, ...args], {
        cwd: consumer,
        env: environment,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      assert.equal(code, expectedCode, `bun ${args.join(" ")}\n${stdout}${stderr}`);
      return stdout;
    };
    const help = JSON.parse(await execute(["x", "relkit", "--json", "--help"]));
    assert.equal(help.name, "relkit");
    assert.ok(help.commands.includes("create"));
    const installations = (await readdir(bunxTemporary)).filter((name) => name.startsWith("bunx-"));
    assert.equal(installations.length, 1);
    const installedWrapper = join(bunxTemporary, installations[0]!, "node_modules/relkit");
    const installed = JSON.parse(await readFile(join(installedWrapper, "package.json"), "utf8"));
    assert.equal(installed.name, "relkit");
    assert.equal(installed.version, packed.version);
    assert.equal(installed.dependencies["@relkit/cli"], packed.version);
    // Bun can link the hoisted dependency's bin; exercise the wrapper itself too.
    const wrapperBinary = join(installedWrapper, "dist/bin.js");
    assert.deepEqual(help, JSON.parse(await execute([wrapperBinary, "--json", "--help"])));
    const scoped = ["x", "--package", `@relkit/cli@${packed.version}`, "relkit"];
    assert.deepEqual(help, JSON.parse(await execute([...scoped, "--json", "--help"])));
    for (const specifier of ["relkit@latest", `relkit@${packed.version}`])
      assert.deepEqual(JSON.parse(await execute(["x", specifier, "--json", "--version"])), {
        name: "relkit",
        version: packed.version,
      });
    const invalid = ["--json", "--help", "--version"];
    const scopedFailure = await execute([...scoped, ...invalid], 2);
    assert.deepEqual(
      JSON.parse(await execute(["x", "relkit", ...invalid], 2)),
      JSON.parse(scopedFailure),
    );
    assert.deepEqual(
      JSON.parse(await execute([wrapperBinary, ...invalid], 2)),
      JSON.parse(scopedFailure),
    );
    const create = [
      "create",
      "alias-app",
      "--template",
      "minimal",
      "--cloud",
      "none",
      "--deploy",
      "none",
      "--no-install",
      "--no-git",
      "--json",
    ];
    const aliasProject = join(consumer, "alias-project");
    const scopedProject = join(consumer, "scoped-project");
    const wrapperProject = join(consumer, "wrapper-project");
    for (const [command, destination] of [
      [["x", "relkit"], aliasProject],
      [scoped, scopedProject],
      [[wrapperBinary], wrapperProject],
    ] as const) {
      const result = JSON.parse(await execute([...command, ...create, "--directory", destination]));
      assert.equal(result.destination, destination);
      const project = JSON.parse(await readFile(join(destination, "package.json"), "utf8"));
      assert.equal(project.devDependencies["@relkit/cli"], packed.version);
    }
    assert.deepEqual(await snapshotProject(aliasProject), await snapshotProject(scopedProject));
    assert.deepEqual(await snapshotProject(wrapperProject), await snapshotProject(scopedProject));
    console.log("Packed bunx relkit passed: help, versions, usage exits, and scaffold parity.");
  } finally {
    if (server !== undefined) await server.stop(true);
    await rm(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const index = process.argv.indexOf("--artifacts");
  const directory = index === -1 ? undefined : process.argv[index + 1];
  if (directory === undefined) throw new Error("--artifacts requires a release manifest directory");
  await smokePackedRelkit(resolve(directory));
}
