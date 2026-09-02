import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DeploymentPlan } from "@relkit/deploy";
import {
  deploymentIntegrationEntries,
  loadDeploymentIntegrations,
} from "./src/commands/deployment-integrations.ts";

test("loads only selected verified deployment role exports", async () => {
  const root = await fixture();
  try {
    const loaded = await loadDeploymentIntegrations(root, plan());
    expect(
      deploymentIntegrationEntries(loaded).map((entry) => [
        entry.metadata.role,
        entry.metadata.integrationId,
        entry.exportName,
      ]),
    ).toEqual([
      ["access", "aws", "./access"],
      ["engine", "pulumi", "./engine"],
      ["host", "aws", "./host"],
      ["infrastructure", "aws", "./infrastructure"],
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a selected export that reports another role", async () => {
  const root = await fixture({ hostRole: "access" });
  try {
    await expect(loadDeploymentIntegrations(root, plan())).rejects.toThrow(
      "reports incompatible metadata",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture(options: { readonly hostRole?: string } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-deployment-integrations-"));
  await Promise.all([
    integrationPackage(
      root,
      "pulumi",
      { deploymentEngine: "./engine" },
      {
        engine: "engine",
      },
    ),
    integrationPackage(
      root,
      "aws",
      { host: "./host", infrastructure: "./infrastructure", access: "./access" },
      {
        host: options.hostRole ?? "host",
        infrastructure: "infrastructure",
        access: "access",
      },
    ),
  ]);
  return root;
}

async function integrationPackage(
  root: string,
  integrationId: string,
  exports: Record<string, string>,
  roles: Record<string, string>,
): Promise<void> {
  const directory = join(root, "node_modules", "@relkit", integrationId);
  await mkdir(directory, { recursive: true });
  const packageExports = Object.fromEntries(
    Object.values(exports).map((exportName) => [exportName, `${exportName}.js`]),
  );
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: `@relkit/${integrationId}`,
      version: "1.2.3",
      type: "module",
      exports: { ".": "./index.js", ...packageExports },
      relkit: { integration: { id: integrationId, exports } },
    }),
  );
  await writeFile(join(directory, "index.js"), "export {};\n");
  await Promise.all(
    Object.entries(roles).map(([name, role]) =>
      writeFile(
        join(directory, `${name}.js`),
        `export const deploymentIntegration = Object.freeze({ kind: "deployment-integration", protocolVersion: 1, integrationId: ${JSON.stringify(integrationId)}, role: ${JSON.stringify(role)} });\n`,
      ),
    ),
  );
}

function plan(): DeploymentPlan {
  const reference = (
    role: "engine" | "host" | "infrastructure" | "access",
    integrationId: string,
  ) => ({ role, integrationId, protocolVersion: 1 as const, configuration: {} });
  return {
    engine: reference("engine", "pulumi"),
    host: reference("host", "aws"),
    infrastructureOperations: [{ integration: reference("infrastructure", "aws") }],
    accessOperations: [{ integration: reference("access", "aws") }],
  } as DeploymentPlan;
}
