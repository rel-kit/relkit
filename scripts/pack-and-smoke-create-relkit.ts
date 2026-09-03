import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
      ANTHROPIC_API_KEY: "relkit-smoke-anthropic",
      EVENT_BUS_NAME: "relkit-smoke",
      EVENT_ENDPOINT: "http://127.0.0.1:4566",
      OPENAI_API_KEY: "relkit-smoke-openai",
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
    for (const template of ["minimal", "api", "agent"] as const) {
      const base = [
        "--template",
        template,
        "--cloud",
        "none",
        "--deploy",
        "none",
        "--install",
        "--no-git",
        "--examples",
        "--json",
      ];
      const args = (directory: string) => [`${template}-app`, "--directory", directory, ...base];
      const direct = JSON.parse(
        (
          await runCommand(
            [createBin, ...args(`${template}-tarball-project`)],
            temporary,
            registry,
            cacheDir,
          )
        )
          .trim()
          .split(/\r?\n/)
          .at(-1)!,
      ) as { destination: string };
      const cli = JSON.parse(
        await runCommand(
          [
            join(temporary, "node_modules/.bin/relkit"),
            "create",
            ...args(`${template}-cli-project`),
          ],
          temporary,
          registry,
          cacheDir,
        ),
      ) as { destination: string };
      if (
        !direct.destination.endsWith(`/${template}-tarball-project`) ||
        !cli.destination.endsWith(`/${template}-cli-project`)
      )
        throw new Error(`Packed ${template} generators returned unexpected destinations.`);
      const directBytes = await snapshotProject(direct.destination);
      if (JSON.stringify(directBytes) !== JSON.stringify(await snapshotProject(cli.destination)))
        throw new Error(`Packed ${template} generators generated different bytes.`);
      await verifyProject(direct.destination, registry, cacheDir);
      await verifyProject(cli.destination, registry, cacheDir);
      const second = JSON.parse(
        (
          await runCommand(
            [createBin, ...args(`${template}-second-project`)],
            temporary,
            registry,
            cacheDir,
          )
        )
          .trim()
          .split(/\r?\n/)
          .at(-1)!,
      ) as { destination: string };
      if (JSON.stringify(directBytes) !== JSON.stringify(await snapshotProject(second.destination)))
        throw new Error(`${template} generation was not byte-deterministic.`);
      console.log(`packed ${template} smoke passed`);
    }
    console.log(`packed create smoke passed (${tarballs.size} packages)`);
  } finally {
    server?.stop(true);
    await rm(temporary, { recursive: true, force: true });
  }
}
if (import.meta.main) await main();
