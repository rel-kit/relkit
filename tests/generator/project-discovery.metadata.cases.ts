/** Retains original metadata assertions for project-discovery, registered by the owning suite. */
import { expect } from "bun:test";
import { join } from "node:path";
import {
  discoverProject,
  normalizeAddRequest,
  planAdd,
  resolveAddRequestDetails,
} from "../../packages/cli/src/scaffolding/index.ts";
import { withProject, write } from "./project-discovery.fixture.js";
export async function case2Metadata() {
  await withProject(async (root) => {
    await seedDiscoveryProject(root);
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
        expect.objectContaining({
          kind: "prompt",
          path: "src/orders/prompts/support.prompt.ts",
        }),
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
    await assertSelectedProfiles(root);
  });
}

/** Seeds the exact original config and grouped service source bytes. */
async function seedDiscoveryProject(root: string) {
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
}
/** Checks explicit and inherited provider planning against the same project. */
async function assertSelectedProfiles(root: string) {
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
    normalizeAddRequest(["service", "Billing", "--full", "--project-root", root, "--no-install"]),
  );
  expect(full.profiles).not.toContainEqual({ capability: "cache", name: "local" });
  expect(
    full.operations.find((operation) => operation.path.endsWith("example.cache.ts"))?.content,
  ).toContain('profile: "shared"');
}
