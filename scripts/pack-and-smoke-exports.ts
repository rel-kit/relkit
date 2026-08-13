import { cp, mkdtemp, readFile, readdir, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootExport = {
  types: "./dist/index.d.ts",
  import: "./dist/index.js",
};

type PackageManifest = {
  name?: string;
  exports?: Record<string, unknown>;
  bin?: Record<string, string>;
};

async function runBun(args: string[], cwd: string): Promise<string> {
  const child = Bun.spawn([process.execPath, ...args], {
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
    throw new Error(`bun ${args.join(" ")} failed in ${cwd}\n${stdout}${stderr}`);
  }

  return stdout;
}

async function runNode(args: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(["node", ...args], {
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
    throw new Error(`node ${args.join(" ")} failed in ${cwd}\n${stdout}${stderr}`);
  }

  return stdout;
}

async function readManifest(packageDirectory: string): Promise<PackageManifest> {
  const manifestPath = join(packageDirectory, "package.json");
  return JSON.parse(await readFile(manifestPath, "utf8")) as PackageManifest;
}

function assertPackageManifest(packageDirectory: string, manifest: PackageManifest): void {
  const packageDirectoryName = basename(packageDirectory);
  const expectedName =
    packageDirectoryName === "create-zsys" ? "create-zsys" : `@zsys/${packageDirectoryName}`;

  if (manifest.name !== expectedName) {
    throw new Error(`Unexpected package name in ${packageDirectory}: ${manifest.name}`);
  }

  const actualRoot = manifest.exports?.["."];
  if (
    Object.keys(manifest.exports ?? {}).length !== 1 ||
    JSON.stringify(actualRoot) !== JSON.stringify(rootExport)
  ) {
    throw new Error(`Unsupported export map in ${packageDirectory}`);
  }

  const expectedBin =
    packageDirectoryName === "cli"
      ? { zsys: "./dist/index.js" }
      : packageDirectoryName === "create-zsys"
        ? { "create-zsys": "./dist/index.js" }
        : undefined;
  if (expectedBin && JSON.stringify(manifest.bin) !== JSON.stringify(expectedBin)) {
    throw new Error(`Unexpected bin entry in ${packageDirectory}`);
  }
}

async function packPackage(packageDirectory: string, artifactRoot: string): Promise<string> {
  const artifactDirectory = join(artifactRoot, basename(packageDirectory));
  await mkdir(artifactDirectory);
  await runBun(["run", "build"], packageDirectory);
  await runBun(
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
  const packageRoot = join(repositoryRoot, "packages");
  const packageDirectories = (await readdir(packageRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packageRoot, entry.name))
    .sort();

  for (const packageDirectory of packageDirectories) {
    assertPackageManifest(packageDirectory, await readManifest(packageDirectory));
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "zsys-export-smoke-"));
  try {
    const fixtureRoot = join(temporaryRoot, "fixture");
    const artifactRoot = join(temporaryRoot, "artifacts");
    await cp(join(repositoryRoot, "tests", "exports", "fixture"), fixtureRoot, {
      recursive: true,
    });
    await mkdir(artifactRoot);

    const appTarball = await packPackage(join(packageRoot, "app"), artifactRoot);
    const compilerTarball = await packPackage(join(packageRoot, "compiler"), artifactRoot);
    await runBun(["add", appTarball, compilerTarball], fixtureRoot);
    process.stdout.write(await runNode(["resolve.mjs"], fixtureRoot));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
