/** Stages only explicit private authorization/realtime/agent acceptance inputs and borrows installed native provider/model packages without activation. */
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { generatedProtectionAuthoritySources } from "./generated-protection-authority.sources.js";
import { generatedProtectionFunctionSources } from "./generated-protection-functions.sources.js";
import nativeManifest from "../../../integrations/packages/langchain/package.json";

/**
 * Extends one owned native host fixture using only existing public authoring APIs and local providers.
 * @param root - Scope-owned application tree.
 * @param repository - Read-only installed SDK identity.
 * @returns Completion before any application runtime resource is acquired.
 */
export const prepareGeneratedProtection = Effect.fn("GeneratedProtection.stage")(
  (root: string, repository: string) =>
    scaffoldNative("protection.fixture.stage", async () => {
      if (!existsSync(join(root, "node_modules/@relkit/local")))
        await symlink(
          join(repository, "integrations/packages/local"),
          join(root, "node_modules/@relkit/local"),
        );
      await linkNativeAgentPackages(root, repository);
      const configPath = join(root, "relkit.config.ts");
      const config = await readFile(configPath, "utf8");
      if (!config.includes("  server: { port: 3000 },"))
        throw new Error("Maintained native configuration changed");
      await writeFile(
        configPath,
        'import { localRealtime, localAgentState } from "@relkit/local";\n' +
          config.replace(
            "  server: { port: 3000 },",
            '  realtime: localRealtime(), "agent-state": localAgentState(),\n  defaults: { realtime: "default", "agent-state": "default" },\n  server: { port: 3000 },',
          ),
      );
      for (const [path, text] of Object.entries({
        ...generatedProtectionAuthoritySources,
        ...generatedProtectionFunctionSources,
      })) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), text);
      }
    }),
);

/** Installs no packages; borrows the exact already-installed SDK selection for this private fixture. */
async function linkNativeAgentPackages(root: string, repository: string): Promise<void> {
  const integration = join(repository, "integrations/packages/langchain");
  const sdkNames = ["@langchain/core", "@langchain/langgraph", "langchain", "langsmith"] as const;
  for (const [name, source] of [
    ["@relkit/langchain", integration],
    ...sdkNames.map((name) => [name, join(integration, "node_modules", name)] as const),
  ]) {
    const target = join(root, "node_modules", name);
    if (!existsSync(target)) {
      await mkdir(dirname(target), { recursive: true });
      await symlink(source, target);
    }
  }
  const path = join(root, "package.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  manifest.dependencies = {
    ...manifest.dependencies,
    "@relkit/langchain": nativeManifest.version,
    ...Object.fromEntries(sdkNames.map((name) => [name, nativeManifest.peerDependencies[name]])),
  };
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
}
