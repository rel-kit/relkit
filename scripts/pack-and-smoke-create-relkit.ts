import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exerciseScaffoldRoutes, verifyScaffoldBuild } from "./scaffold-smoke-workflows.js";
import { verifyInteractiveResolver, verifyScaffoldTerminal } from "./scaffold-smoke-terminal.js";
import { addArtifacts } from "./pack-and-smoke-create-relkit-artifacts.js";
import {
  runCommand,
  snapshotProject,
  verifyProject,
} from "./pack-and-smoke-create-relkit-support.js";
import {
  loadReleaseTarballs,
  packPackages,
  readManifests,
  startRegistry,
} from "./pack-and-smoke-create-relkit-pack.js";
import { releaseTemplates } from "./release-templates.js";

async function main(): Promise<void> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const temporary = await mkdtemp(join(tmpdir(), "relkit-create-smoke-"));
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    const manifests = await readManifests(repositoryRoot);
    const artifactIndex = process.argv.indexOf("--artifacts");
    const artifactDirectory = artifactIndex === -1 ? undefined : process.argv[artifactIndex + 1];
    if (artifactIndex !== -1 && artifactDirectory === undefined)
      throw new Error("--artifacts requires a directory");
    const tarballs = artifactDirectory
      ? await loadReleaseTarballs(resolve(artifactDirectory))
      : await packPackages(temporary, manifests);
    const allocatePort = async (): Promise<number> => {
      const probe = Bun.serve({ port: 0, fetch: () => new Response() });
      const port = probe.port;
      await probe.stop(true);
      if (port === undefined) throw new Error("Unable to allocate a smoke port.");
      return port;
    };
    process.env.PORT = String(await allocatePort());
    process.env.RELKIT_INSPECTOR_PORT = String(await allocatePort());
    Object.assign(process.env, {
      EVENT_BUS_NAME: "relkit-smoke",
      EVENT_ENDPOINT: "http://127.0.0.1:4566",
    });
    server = await startRegistry(temporary, tarballs, manifests);
    const registry = `http://127.0.0.1:${server.port!}`;
    const cacheDir = join(temporary, "cache");
    const version = manifests.get("@relkit/app")?.manifest.version;
    if (version === undefined) throw new Error("Missing @relkit/app version");
    await writeFile(
      join(temporary, "package.json"),
      JSON.stringify({
        name: "relkit-packed-smoke",
        private: true,
        type: "module",
        dependencies: { "@relkit/cli": version, "create-relkit": version },
      }) + "\n",
    );
    await runCommand(
      ["install", "--force", "--no-cache", "--registry", registry],
      temporary,
      registry,
      cacheDir,
    );
    const createBin = join(temporary, "node_modules/.bin/create-relkit");
    const relkitBin = join(temporary, "node_modules/.bin/relkit");
    await verifyInteractiveResolver(temporary);
    for (const template of releaseTemplates) {
      const jobVariants: readonly (string | undefined)[] =
        template === "minimal"
          ? [
              undefined,
              "inngest-docker",
              "effect-mq-docker",
              ...(process.env.RELKIT_TEST_DOCKER === "1" ? [] : ["trigger-docker"]),
            ]
          : [undefined];
      for (const jobs of jobVariants) {
        const projectTemplate = jobs === undefined ? template : `tasks-${jobs}`;
        const generationCache = (name: string) => join(cacheDir, `${projectTemplate}-${name}`);
        const base = [
          "--template",
          template,
          ...(jobs === undefined ? [] : ["--jobs", jobs]),
          "--cloud",
          "none",
          "--deploy",
          "none",
          "--install",
          "--no-git",
          "--examples",
          "--json",
        ];
        const args = (directory: string) => [
          `${projectTemplate}-app`,
          "--directory",
          directory,
          ...base,
        ];
        const direct = JSON.parse(
          (
            await runCommand(
              [createBin, ...args(`${projectTemplate}-tarball-project`)],
              temporary,
              registry,
              generationCache("direct"),
            )
          )
            .trim()
            .split(/\r?\n/)
            .at(-1)!,
        ) as { destination: string };
        const cli = JSON.parse(
          await runCommand(
            [relkitBin, "create", ...args(`${projectTemplate}-cli-project`)],
            temporary,
            registry,
            generationCache("cli"),
          ),
        ) as { destination: string };
        if (
          !direct.destination.endsWith(`/${projectTemplate}-tarball-project`) ||
          !cli.destination.endsWith(`/${projectTemplate}-cli-project`)
        )
          throw new Error(`Packed ${projectTemplate} generators returned unexpected destinations.`);
        const directBytes = await snapshotProject(direct.destination);
        const cliBytes = await snapshotProject(cli.destination);
        if (JSON.stringify(directBytes) !== JSON.stringify(cliBytes))
          throw new Error(`Packed ${projectTemplate} generators generated different bytes.`);
        // Starter tests isolate provider credentials/replacements; additions are exercised live below.
        for (const root of [direct.destination, cli.destination])
          for (const script of ["test", "build"]) await runCommand(["run", script], root);
        await addArtifacts(relkitBin, direct.destination, registry, cacheDir);
        await addArtifacts(relkitBin, cli.destination, registry, cacheDir);
        const directAfterAdd = await snapshotProject(direct.destination);
        const cliAfterAdd = await snapshotProject(cli.destination);
        if (JSON.stringify(directAfterAdd) !== JSON.stringify(cliAfterAdd))
          throw new Error(`Packed ${projectTemplate} chained additions generated different bytes.`);
        for (const root of [direct.destination, cli.destination]) {
          try {
            if (process.env.RELKIT_TEST_DOCKER === "1")
              await verifyScaffoldTerminal(root, relkitBin);
            await verifyScaffoldBuild(root);
            await verifyProject(root, registry, cacheDir, (port) =>
              exerciseScaffoldRoutes(root, port, relkitBin),
            );
          } finally {
            if (process.env.RELKIT_TEST_DOCKER === "1")
              await runCommand(
                [relkitBin, "local", "reset", "--yes", "--project-root", root],
                root,
              );
          }
        }
        const second = JSON.parse(
          (
            await runCommand(
              [createBin, ...args(`${projectTemplate}-second-project`)],
              temporary,
              registry,
              generationCache("second"),
            )
          )
            .trim()
            .split(/\r?\n/)
            .at(-1)!,
        ) as { destination: string };
        if (
          JSON.stringify(directBytes) !== JSON.stringify(await snapshotProject(second.destination))
        )
          throw new Error(`${projectTemplate} generation was not byte-deterministic.`);
        console.log(`packed ${projectTemplate} smoke passed`);
      }
    }
    console.log(`packed create smoke passed (${tarballs.size} packages)`);
  } finally {
    server?.stop(true);
    await rm(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
