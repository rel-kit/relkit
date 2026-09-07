import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ADD_FAILURE_CODES,
  addFactoryObjectMember,
  addSourceExport,
  addSourceImport,
  discoverProject,
  normalizeAddRequest,
  planAdd,
  resolveAddRequestDetails,
} from "../../packages/create-relkit/src/index.ts";

describe("scaffold project discovery", () => {
  test("discovers canonical services, members, tools, prompts, profiles, and imported env", async () => {
    await withProject(async (root) => {
      await write(
        root,
        "relkit.config.ts",
        `import { defineApp } from "@relkit/app/config";\nimport env from "@app/platform/env.js";\nimport { redis } from "@relkit/redis";\nexport default defineApp({ env, cache: { shared: redis() }, defaults: { cache: "shared" } });\n`,
      );
      await write(
        root,
        "src/platform/env.ts",
        `import { defineEnv } from "@relkit/app/config";\nexport default defineEnv({});\n`,
      );
      await write(
        root,
        "src/orders/service.ts",
        `import { defineService } from "@relkit/app/services";\nimport listOrders from "./functions/list-orders.function.js";\nexport default defineService({ functions: { listOrders } });\n`,
      );
      await write(
        root,
        "src/orders/functions/list-orders.function.ts",
        `import { defineFunction } from "@relkit/app/functions";\nconst listOrders = defineFunction({ input: schema, output: schema, handler: async () => ({}) });\nexport default listOrders;\n`,
      );
      await write(
        root,
        "src/orders/tools/list.tool.ts",
        `import listOrders from "../functions/list-orders.function.js";\nexport default listOrders.asTool({ description: "List" });\n`,
      );
      await write(
        root,
        "src/orders/prompts/support.prompt.ts",
        `import { definePrompt } from "@relkit/app";\nexport default definePrompt("Help");\n`,
      );
      const result = await discoverProject(root);

      expect(result.envPath).toBe(join(root, "src/platform/env.ts"));
      expect(result.awsPulumiDeployment).toBeFalse();
      expect(result.services).toEqual([
        expect.objectContaining({
          domain: "orders",
          capability: "generic",
          members: [{ name: "listOrders", targetBinding: "listOrders" }],
        }),
      ]);
      expect(result.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "tool", path: "src/orders/tools/list.tool.ts" }),
          expect.objectContaining({ kind: "prompt", path: "src/orders/prompts/support.prompt.ts" }),
        ]),
      );
      expect(result.profiles).toEqual([
        expect.objectContaining({
          capability: "cache",
          name: "shared",
          adapter: "redis",
          isDefault: true,
        }),
      ]);
      expect(
        (await resolveAddRequestDetails(["cache", "Sessions", "--project-root", root])).request,
      ).toMatchObject({ profile: "shared" });
      const explicit = await planAdd(
        normalizeAddRequest([
          "cache",
          "Local Sessions",
          "--project-root",
          root,
          "--service",
          "orders",
          "--provider",
          "redis",
          "--source",
          "docker",
          "--no-install",
        ]),
      );
      expect(explicit.profiles).toEqual([{ capability: "cache", name: "local" }]);
      const full = await planAdd(
        normalizeAddRequest([
          "service",
          "Billing",
          "--full",
          "--project-root",
          root,
          "--no-install",
        ]),
      );
      expect(full.profiles).not.toContainEqual({ capability: "cache", name: "local" });
      expect(
        full.operations.find((operation) => operation.path.endsWith("example.cache.ts"))?.content,
      ).toContain('profile: "shared"');
    });
  });

  test("requires real AWS and Pulumi imports before offering provisioning", async () => {
    await withProject(async (root) => {
      await write(
        root,
        "relkit.config.ts",
        `// @relkit/aws and @relkit/pulumi are not deployment declarations.\nexport default defineApp({});\n`,
      );
      expect((await discoverProject(root)).awsPulumiDeployment).toBeFalse();
      await write(
        root,
        "relkit.config.ts",
        `import { aws } from "@relkit/aws";\nimport { pulumi } from "@relkit/pulumi";\nexport default defineApp({ cloud: aws(), deployment: pulumi() });\n`,
      );
      expect((await discoverProject(root)).awsPulumiDeployment).toBeTrue();
    });
  });

  test("plans byte-preserving canonical insertions and refuses unsafe shapes", () => {
    const service = `import { defineService } from "@relkit/app/services";\n\nexport default defineService({ functions: { hello } });\n`;
    const imported = addSourceImport(service, "service.ts", `import added from "./added.js";`);
    const edited = addFactoryObjectMember(
      imported,
      "service.ts",
      ["defineService"],
      ["functions"],
      "added",
      "added",
    );
    expect(edited).toContain(`import added from "./added.js";`);
    expect(edited).toContain("functions: { hello, added }");
    expect(addSourceImport(imported, "service.ts", `import added from "./added.js";`)).toBe(
      imported,
    );
    expect(
      addFactoryObjectMember(
        edited,
        "service.ts",
        ["defineService"],
        ["functions"],
        "added",
        "added",
      ),
    ).toBe(edited);
    const merged = addSourceImport(
      `// keep this byte-for-byte\n${service}`,
      "service.ts",
      `import { type ServiceDescriptor } from "@relkit/app/services";`,
    );
    expect(merged).toStartWith("// keep this byte-for-byte\n");
    expect(merged).toContain("{ defineService, type ServiceDescriptor }");
    expect(service.replace("\n\n", "\n...mixins,\n")).not.toBe(edited);
    expect(() =>
      addSourceImport(`import {`, "service.ts", `import added from "./added.js";`),
    ).toThrow();
    expect(() =>
      addFactoryObjectMember(
        `defineService({ ...shared })`,
        "service.ts",
        ["defineService"],
        [],
        "functions",
        "functions: {}",
      ),
    ).toThrow();
    try {
      addFactoryObjectMember(
        `defineService(options)`,
        "service.ts",
        ["defineService"],
        [],
        "functions",
        "functions: {}",
      );
    } catch (error) {
      expect(error).toMatchObject({ code: ADD_FAILURE_CODES.unsupportedSourceShape });
    }

    const app = `export default defineApp({\n  env,\n});\n`;
    const withCache = addFactoryObjectMember(
      app,
      "relkit.config.ts",
      ["defineApp"],
      [],
      "cache",
      "cache: { local: redis() }",
    );
    expect(withCache).toContain("cache: { local: redis() }");
    expect(
      addSourceExport("export const items = {};\n", "schema.ts", `export * from "./auth.js";`),
    ).toEndWith(`export * from "./auth.js";\n`);
    expect(
      addFactoryObjectMember(
        withCache,
        "relkit.config.ts",
        ["defineApp"],
        ["defaults"],
        "cache",
        `cache: "local"`,
      ),
    ).toContain(`defaults: { cache: "local" }`);
    expect(
      addFactoryObjectMember(
        `export default defineEnv({});\n`,
        "src/platform/env.ts",
        ["defineEnv"],
        [],
        "TOKEN",
        `TOKEN: env.secret("TOKEN")`,
      ),
    ).toContain(`TOKEN: env.secret("TOKEN")`);
  });
});

async function withProject(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "relkit-discovery-"));
  try {
    await write(root, "package.json", `{ "name": "test", "type": "module" }\n`);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function write(root: string, path: string, content: string): Promise<void> {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), content);
}
