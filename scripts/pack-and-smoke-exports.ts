import { access, cp, mkdtemp, readFile, readdir, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootExport = {
  types: "./dist/index.d.ts",
  import: "./dist/index.js",
};

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

async function unpackTarball(tarball: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  const child = Bun.spawn(["tar", "-xzf", tarball, "--strip-components=1", "-C", target], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(child.stderr).text();
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`tar extraction failed for ${tarball}\n${stderr}`);
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
  const expectedExports =
    packageDirectoryName === "cloud-aws"
      ? {
          ".": rootExport,
          "./runtime": {
            types: "./dist/runtime/index.d.ts",
            import: "./dist/runtime/index.js",
          },
        }
      : packageDirectoryName === "config"
        ? {
            ".": rootExport,
            "./internal/config": {
              types: "./dist/internal/config.d.ts",
              import: "./dist/internal/config.js",
            },
          }
        : { ".": rootExport };
  if (
    JSON.stringify(manifest.exports) !== JSON.stringify(expectedExports) ||
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
  const packageRoot = join(repositoryRoot, "packages");
  const packageDirectories = (await readdir(packageRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packageRoot, entry.name))
    .sort();
  const manifests = new Map<string, PackageManifest>();

  for (const packageDirectory of packageDirectories) {
    const manifest = await readManifest(packageDirectory);
    assertPackageManifest(packageDirectory, manifest);
    if (manifest.name) manifests.set(manifest.name, manifest);
  }

  const requiredNames = new Set(["@zsys/app", "@zsys/compiler"]);
  for (const packageName of requiredNames) {
    for (const dependency of Object.keys(manifests.get(packageName)?.dependencies ?? {})) {
      if (manifests.has(dependency)) requiredNames.add(dependency);
    }
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "zsys-export-smoke-"));
  try {
    const fixtureRoot = join(temporaryRoot, "fixture");
    const artifactRoot = join(temporaryRoot, "artifacts");
    await cp(join(repositoryRoot, "tests", "exports", "fixture"), fixtureRoot, {
      recursive: true,
    });
    await mkdir(artifactRoot);

    const tarballs = new Map<string, string>();
    for (const packageDirectory of packageDirectories) {
      const manifest = manifests.get((await readManifest(packageDirectory)).name ?? "");
      if (manifest?.name && requiredNames.has(manifest.name)) {
        tarballs.set(manifest.name, await packPackage(packageDirectory, artifactRoot));
      }
    }
    for (const [name, tarball] of tarballs) {
      await unpackTarball(tarball, join(fixtureRoot, "node_modules", ...name.split("/")));
    }
    const externalDependencies = new Set<string>();
    for (const name of requiredNames) {
      for (const dependency of Object.keys(manifests.get(name)?.dependencies ?? {})) {
        if (!manifests.has(dependency)) externalDependencies.add(dependency);
      }
    }
    for (const dependency of [...externalDependencies].sort()) {
      const sourceCandidates = [
        join(repositoryRoot, "node_modules", ...dependency.split("/")),
        ...packageDirectories.map((directory) =>
          join(directory, "node_modules", ...dependency.split("/")),
        ),
      ];
      let source: string | undefined;
      for (const candidate of sourceCandidates) {
        try {
          await access(candidate);
          source = candidate;
          break;
        } catch {
          // Try the next workspace-local dependency location.
        }
      }
      if (source === undefined) throw new Error(`Missing packed dependency ${dependency}`);
      const target = join(fixtureRoot, "node_modules", ...dependency.split("/"));
      await mkdir(dirname(target), { recursive: true });
      await cp(source, target, { recursive: true, dereference: true });
    }
    process.stdout.write(await runProcess("node", ["resolve.mjs"], fixtureRoot));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
