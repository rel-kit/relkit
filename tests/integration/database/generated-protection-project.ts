/** Stages only explicit private authorization/realtime/agent acceptance inputs and borrows installed native provider/model packages without activation. */
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { generatedProtectionAuthoritySources } from "./generated-protection-authority.sources.js";
import { generatedProtectionFunctionSources } from "./generated-protection-functions.sources.js";

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
      if (!existsSync(join(root, "node_modules/langchain")))
        await symlink(
          join(repository, "packages/agents/node_modules/langchain"),
          join(root, "node_modules/langchain"),
        );
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
