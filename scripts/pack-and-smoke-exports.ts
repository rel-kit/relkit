import { cp, mkdtemp, readFile, readdir, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadReleaseTarballs } from "./pack-and-smoke-create-relkit-pack.js";
import {
  copyExternalDependencies,
  smokeMinimalIntegrationInstalls,
  unpackTarball,
} from "./pack-and-smoke-integration-minimal.js";
import { expectedExports } from "./release-package-contract.js";
import { workspacePackageDirectories } from "./workspace-packages.js";
type PackageManifest = {
  name?: string;
  dependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
  bin?: Record<string, string>;
};
async function runProcess(command: string, args: string[], cwd: string): Promise<string> {
  const child = Bun.spawn([command, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}\n${stdout}${stderr}`);
  }
  return stdout;
}
async function readManifest(packageDirectory: string): Promise<PackageManifest> {
  const manifestPath = join(packageDirectory, "package.json");
  return JSON.parse(await readFile(manifestPath, "utf8")) as PackageManifest;
}
function assertPackageManifest(
  repositoryRoot: string,
  packageDirectory: string,
  manifest: PackageManifest,
): void {
  const packageDirectoryName = basename(packageDirectory);
  const expectedName =
    relative(repositoryRoot, packageDirectory) === "integrations/catalog"
      ? "@relkit/integrations"
      : packageDirectoryName === "create-relkit"
        ? "create-relkit"
        : `@relkit/${packageDirectoryName}`;
  if (manifest.name !== expectedName) {
    throw new Error(`Unexpected package name in ${packageDirectory}: ${manifest.name}`);
  }
  if (
    JSON.stringify(manifest.exports) !==
    JSON.stringify(expectedExports(packageDirectoryName, manifest.name))
  ) {
    throw new Error(`Unsupported export map in ${packageDirectory}`);
  }
  const expectedBin =
    packageDirectoryName === "cli"
      ? { relkit: "./dist/index.js" }
      : packageDirectoryName === "create-relkit"
        ? { "create-relkit": "./dist/index.js" }
        : undefined;
  if (expectedBin && JSON.stringify(manifest.bin) !== JSON.stringify(expectedBin)) {
    throw new Error(`Unexpected bin entry in ${packageDirectory}`);
  }
}
async function packPackage(packageDirectory: string, artifactRoot: string): Promise<string> {
  const artifactDirectory = join(artifactRoot, basename(packageDirectory));
  await mkdir(artifactDirectory);
  await runProcess(process.execPath, ["run", "build"], packageDirectory);
  await runProcess(
    process.execPath,
    ["pm", "pack", "--ignore-scripts", "--destination", artifactDirectory, "--quiet"],
    packageDirectory,
  );
  const artifacts = (await readdir(artifactDirectory)).filter((file) => file.endsWith(".tgz"));
  if (artifacts.length !== 1 || !artifacts[0]) {
    throw new Error(`Expected one packed artifact for ${packageDirectory}`);
  }
  return join(artifactDirectory, artifacts[0]);
}
async function main(): Promise<void> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const packageDirectories = workspacePackageDirectories(repositoryRoot);
  const manifests = new Map<string, PackageManifest>();
  const requiredNames = new Set(["@relkit/app", "@relkit/compiler"]);
  const integrationNames = new Set<string>();
  for (const packageDirectory of packageDirectories) {
    const manifest = await readManifest(packageDirectory);
    assertPackageManifest(repositoryRoot, packageDirectory, manifest);
    if (manifest.name) {
      manifests.set(manifest.name, manifest);
      const packagePath = relative(repositoryRoot, packageDirectory);
      if (packagePath.startsWith("integrations/")) requiredNames.add(manifest.name);
      if (packagePath.startsWith("integrations/packages/")) integrationNames.add(manifest.name);
    }
  }
  for (const packageName of requiredNames) {
    for (const dependency of Object.keys(manifests.get(packageName)?.dependencies ?? {})) {
      if (manifests.has(dependency)) requiredNames.add(dependency);
    }
  }
  const temporaryRoot = await mkdtemp(join(tmpdir(), "relkit-export-smoke-"));
  try {
    const fixtureRoot = join(temporaryRoot, "fixture");
    const artifactRoot = join(temporaryRoot, "artifacts");
    await cp(join(repositoryRoot, "tests", "exports", "fixture"), fixtureRoot, {
      recursive: true,
    });
    await mkdir(artifactRoot);

    const artifactIndex = process.argv.indexOf("--artifacts");
    const artifactDirectory = artifactIndex === -1 ? undefined : process.argv[artifactIndex + 1];
    if (artifactIndex !== -1 && artifactDirectory === undefined)
      throw new Error("--artifacts requires a directory");
    const releaseTarballs = artifactDirectory
      ? await loadReleaseTarballs(resolve(artifactDirectory))
      : undefined;
    const tarballs = new Map<string, string>();
    for (const packageDirectory of packageDirectories) {
      const manifest = manifests.get((await readManifest(packageDirectory)).name ?? "");
      if (manifest?.name && requiredNames.has(manifest.name)) {
        const tarball = releaseTarballs?.get(manifest.name);
        if (releaseTarballs && tarball === undefined)
          throw new Error(`Missing release tarball for ${manifest.name}`);
        tarballs.set(manifest.name, tarball ?? (await packPackage(packageDirectory, artifactRoot)));
      }
    }
    const minimalCount = await smokeMinimalIntegrationInstalls(
      join(temporaryRoot, "minimal"),
      repositoryRoot,
      packageDirectories,
      integrationNames,
      manifests,
      tarballs,
    );
    console.log(
      `Minimal integration installs passed: ${minimalCount} packages loaded without unrelated integrations or SDKs.`,
    );
    for (const [name, tarball] of tarballs) {
      await unpackTarball(tarball, join(fixtureRoot, "node_modules", ...name.split("/")));
    }
    await writeFile(
      join(fixtureRoot, "expected-exports.json"),
      JSON.stringify(
        Object.fromEntries(
          [...requiredNames].sort().map((name) => [name, manifests.get(name)?.exports]),
        ),
      ),
    );
    const externalDependencies = new Set<string>();
    for (const name of requiredNames) {
      for (const dependency of Object.keys(manifests.get(name)?.dependencies ?? {})) {
        if (!manifests.has(dependency)) externalDependencies.add(dependency);
      }
    }
    await copyExternalDependencies(
      fixtureRoot,
      externalDependencies,
      repositoryRoot,
      packageDirectories,
    );
    process.stdout.write(await runProcess("node", ["resolve.mjs"], fixtureRoot));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
