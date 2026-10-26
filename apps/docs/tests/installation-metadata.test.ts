/**
 * Exercises recipe selection against changed/malformed owner metadata. These
 * controls catch silent SDK omission, global-version assumptions and accidental
 * optional peer installation without evaluating any integration implementation.
 */
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  installationDeclarations,
  loadInstallationCatalog,
} from "../scripts/installation-catalog.js";
import { renderInstallation } from "../scripts/generate-installations.js";
import { installationRecipes } from "../scripts/installation-recipes.js";

const catalog = await loadInstallationCatalog(resolve(import.meta.dir, "../../.."));

test("a changed owner release and SDK pin flow into commands without changing neighbors", () => {
  const packages = new Map(catalog.packages);
  const native = packages.get("@relkit/langchain");
  if (!native) throw new Error("Native owner fixture is required.");
  packages.set(native.name, {
    ...native,
    version: "9.8.7",
    relkit: {
      integration: {
        dependencies: [
          {
            package: "langchain",
            supportedRange: "1.5.11",
            installSection: "dependencies",
            capabilities: ["agent-execution"],
            phases: ["runtime"],
          },
        ],
      },
    },
  });
  const source = renderInstallation(installationRecipes.agent, { ...catalog, packages });
  expect(source).toContain(
    `bun add @relkit/langchain@9.8.7 @relkit/local@${packages.get("@relkit/local")?.version} langchain@1.5.11\n`,
  );
});

test("named peer catalog ranges stay quoted and unselected peers stay absent", () => {
  const workspace = {
    ...catalog.workspace,
    catalogs: { peer: { ...catalog.workspace.catalogs.peer, react: ">=18.2.0 <20.0.0" } },
  };
  const source = renderInstallation(installationRecipes["client-react"], { ...catalog, workspace });
  expect(source).toContain("'react@>=18.2.0 <20.0.0'");
  expect(
    installationDeclarations(installationRecipes.client, catalog).dependencies,
  ).not.toHaveProperty("react");
});

test("runtime phase does not silently include a development-only authentication peer", () => {
  const result = installationDeclarations(
    {
      title: "Runtime only",
      selections: [
        { name: "@relkit/better-auth", capabilities: ["better-auth"], phases: ["runtime"] },
      ],
    },
    catalog,
  );
  expect(result.dependencies["better-auth"]).toBe("1.7.1");
  expect(result.devDependencies).not.toHaveProperty("@cloudflare/workers-types");
});

test("missing owners, peers and capabilities fail generation instead of omitting an install", () => {
  for (const selection of [
    { name: "@relkit/missing" },
    { name: "@relkit/client", peers: ["missing-peer"] },
    { name: "@relkit/langchain", capabilities: ["missing-capability"] },
  ]) {
    expect(() =>
      installationDeclarations({ title: "Invalid", selections: [selection] }, catalog),
    ).toThrow(/Missing/);
  }
});

test("conflicting manifest sections cannot generate contradictory install commands", () => {
  expect(() =>
    installationDeclarations(
      {
        title: "Conflict",
        selections: [
          { name: "@relkit/client" },
          { name: "@relkit/client", section: "devDependencies" },
        ],
      },
      catalog,
    ),
  ).toThrow("Conflicting installation requirement");
});

test("HTTP requirement and optional peer drift fails before publishing commands", () => {
  const packages = new Map(catalog.packages);
  const http = packages.get("@relkit/runtime-hono");
  if (!http) throw new Error("HTTP owner fixture is required.");
  packages.set(http.name, {
    ...http,
    peerDependencies: { ...http.peerDependencies, "@ag-ui/core": "99.0.0" },
  });
  expect(() =>
    installationDeclarations(installationRecipes["ag-ui"], { ...catalog, packages }),
  ).toThrow("HTTP SDK metadata disagrees");
});
