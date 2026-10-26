/** Supplies hostile metadata-only packages without evaluating their native implementation. */
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Layer } from "effect";
import { SelectedDependenciesLive } from "@relkit/provider/internal/dependencies";
import { compilerLayer } from "../src/services/compiler.service.js";
import { fileSystemLayer } from "../src/services/filesystem.service.js";
import { moduleLayer } from "../src/services/modules.service.js";

export const capabilities = Layer.mergeAll(
  compilerLayer,
  fileSystemLayer,
  moduleLayer,
  SelectedDependenciesLive,
);

/** Writes one metadata-only fixture with hostile executable exports and a missing native SDK. */
export async function configFixture(
  id: string,
  registrations: readonly string[],
  selected: string,
) {
  const root = await mkdtemp(join(tmpdir(), "relkit-config-preflight-"));
  const directory = join(root, "node_modules/@relkit", id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify(fixtureManifest(id, registrations, selected)),
  );
  for (const file of ["index.js", "runtime.js", "testing.js"])
    await writeFile(join(directory, file), 'throw new Error("AUTHORED CONFIG MUST NOT EVALUATE");');
  await writeFile(join(root, "relkit.config.ts"), `import "@relkit/${id}"; export default {};`);
  await writeFile(join(root, "package.json"), '{"name":"config-preflight","private":true}');
  await writeFile(join(root, "bun.lock"), "unchanged lock bytes");
  return { root, directory };
}

/** Declares exact public exports and the native capability required by this metadata-only package. */
function fixtureManifest(id: string, registrations: readonly string[], selected: string) {
  return {
    name: `@relkit/${id}`,
    version: "1.0.0",
    type: "module",
    exports: { ".": "./index.js", "./runtime": "./runtime.js", "./testing": "./testing.js" },
    relkit: {
      integration: {
        id,
        dependencies: [
          {
            package: "fixture-missing-sdk",
            supportedRange: "1.0.0",
            installSection: "dependencies",
            capabilities: [selected],
            phases: ["check", "runtime"],
          },
        ],
        exports: {
          authoring: ".",
          ...(registrations.length === 0
            ? {}
            : {
                runtime: {
                  export: "./runtime",
                  registrations: registrations.map((capability) => ({
                    capability,
                    adapterId: id,
                    protocolVersion: 1,
                  })),
                },
              }),
        },
      },
    },
  };
}
