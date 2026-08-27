import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runCommand,
  snapshotProject,
  verifyProject,
} from "./pack-and-smoke-create-relkit-support.js";
import { packPackages, readManifests, startRegistry } from "./pack-and-smoke-create-relkit-pack.js";

async function main(): Promise<void> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const temporary = await mkdtemp(join(tmpdir(), "relkit-create-smoke-"));
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    const manifests = await readManifests(repositoryRoot);
    const tarballs = await packPackages(temporary, manifests);
    await cp(
      join(repositoryRoot, "templates", "default"),
      join(temporary, "templates", "default"),
      { recursive: true },
    );
    const allocatePort = async (): Promise<number> => {
      const probe = Bun.serve({ port: 0, fetch: () => new Response() });
      const port = probe.port;
      await probe.stop(true);
      if (port === undefined) throw new Error("Unable to allocate a smoke port.");
      return port;
    };
    process.env.PORT = String(await allocatePort());
    Object.assign(process.env, {
      ANTHROPIC_API_KEY: "relkit-smoke-anthropic",
      EVENT_BUS_NAME: "relkit-smoke",
      EVENT_ENDPOINT: "http://127.0.0.1:4566",
      OPENAI_API_KEY: "relkit-smoke-openai",
    });
    const inspectorPort = await allocatePort();
    for (const template of ["minimal", "api", "agent"]) {
      const config = join(temporary, "templates", "default", "v1", template, "relkit.config.ts");
      await writeFile(
        config,
        (await readFile(config, "utf8")).replace("3210", String(inspectorPort)),
      );
    }
    server = await startRegistry(temporary, tarballs, manifests);
    const registry = `http://127.0.0.1:${server.port!}`;
    const cacheDir = join(temporary, "cache");
    const packedCli = join(temporary, "node_modules/@relkit/cli/dist/index.js");
    await writeFile(
      join(temporary, "package.json"),
      JSON.stringify({
        name: "relkit-packed-smoke",
        private: true,
        type: "module",
        dependencies: { "@relkit/cli": "0.0.0", "create-relkit": "0.0.0" },
      }) + "\n",
    );
    await runCommand(
      ["install", "--force", "--no-cache", "--registry", registry],
      temporary,
      registry,
      cacheDir,
    );
    const runner = join(temporary, "create-runner.mjs");
    await writeFile(
      runner,
      `import { normalizeCreateOptions, generateProject } from "create-relkit";
const freePort = async () => { const probe = Bun.serve({ port: 0, fetch: () => new Response() }); const port = probe.port; await probe.stop(true); if (port === undefined) throw new Error("Unable to allocate a smoke port."); return port; };
const result = await generateProject(normalizeCreateOptions(process.argv.slice(2)), { bunExecutable: process.execPath, relkitExecutable: ${JSON.stringify(packedCli)}, commandRunner: async (command, cwd) => { const bin = ${JSON.stringify(packedCli)}; const ports = command[1] === "doctor" ? [await freePort(), await freePort()] : undefined; const checked = ports === undefined ? command : [...command, "--port", String(ports[0]), "--inspector-port", String(ports[1])]; const actual = checked[0] === bin ? [process.execPath, ...checked] : checked.at(-1) === "install" ? [...checked, "--force", "--registry", ${JSON.stringify(registry)}] : checked; const child = Bun.spawn(actual, { cwd, env: { ...process.env, BUN_CONFIG_REGISTRY: ${JSON.stringify(registry)}, npm_config_registry: ${JSON.stringify(registry)}, BUN_INSTALL_CACHE_DIR: ${JSON.stringify(cacheDir)} }, stdout: "pipe", stderr: "pipe" }); const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]); console.error(stderr); return { stdout, stderr, exitCode }; } });
console.log(JSON.stringify(result));
`,
    );
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
            ["run", "--silent", runner, ...args(`${template}-tarball-project`)],
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
            ["run", "--silent", runner, ...args(`${template}-second-project`)],
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
