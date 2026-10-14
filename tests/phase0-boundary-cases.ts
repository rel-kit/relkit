/** Original forbidden dependency/import cases remain pure strings checked by the actual native boundary scanner. */
import { packageFiles } from "./phase0-contracts.js";
import type { BoundaryCase } from "./phase0-harness.types.js";

export const boundaryCases: readonly BoundaryCase[] = [
  {
    name: "undeclared dependencies",
    files: packageFiles([
      { path: "packages/app", name: "@relkit/app", source: 'import "@relkit/config";' },
      { path: "packages/config", name: "@relkit/config", source: "" },
    ]),
    expected: {
      path: "packages/app/src/index.ts",
      owner: "@relkit/app",
      rule: "undeclared-dependency",
    },
  },
  {
    name: "cross-package relative imports",
    files: packageFiles([
      {
        path: "packages/app",
        name: "@relkit/app",
        source: 'import "../../config/src/index";',
      },
      { path: "packages/config", name: "@relkit/config", source: "" },
    ]),
    expected: {
      path: "packages/app/src/index.ts",
      owner: "@relkit/app",
      rule: "cross-package-relative-import",
    },
  },
  {
    name: "descriptor runtime imports",
    files: packageFiles([
      {
        path: "packages/app",
        name: "@relkit/app",
        source: 'import "@relkit/runtime-effect";',
        dependencies: { "@relkit/runtime-effect": "workspace:*" },
      },
      { path: "packages/runtime-effect", name: "@relkit/runtime-effect", source: "" },
    ]),
    expected: {
      path: "packages/app/src/index.ts",
      owner: "@relkit/app",
      rule: "descriptor-runtime-import",
    },
  },
  {
    name: "core dependencies on standalone integrations",
    files: packageFiles([
      {
        path: "packages/app",
        name: "@relkit/app",
        source: 'import "@relkit/redis";',
        dependencies: { "@relkit/redis": "workspace:*" },
      },
      { path: "integrations/packages/redis", name: "@relkit/redis", source: "" },
    ]),
    expected: {
      path: "packages/app/package.json",
      owner: "@relkit/app",
      rule: "core-integration-dependency",
    },
  },
  {
    name: "engine dependencies on local provider implementations",
    files: packageFiles([
      {
        path: "packages/engine",
        name: "@relkit/engine",
        source: 'import "@relkit/providers-local";',
        dependencies: { "@relkit/providers-local": "workspace:*" },
      },
      {
        path: "packages/providers-local",
        name: "@relkit/providers-local",
        source: "",
      },
    ]),
    expected: {
      path: "packages/engine/package.json",
      owner: "@relkit/engine",
      rule: "engine-local-provider-dependency",
    },
  },
  {
    name: "integration dependencies on non-protocol core packages",
    files: packageFiles([
      {
        path: "integrations/packages/redis",
        name: "@relkit/redis",
        source: 'import "@relkit/app";',
        dependencies: { "@relkit/app": "workspace:*" },
      },
      { path: "packages/app", name: "@relkit/app", source: "" },
    ]),
    expected: {
      path: "integrations/packages/redis/package.json",
      owner: "@relkit/redis",
      rule: "integration-non-protocol-dependency",
    },
  },
  {
    name: "catalog dependencies on core protocols",
    files: packageFiles([
      {
        path: "integrations/catalog",
        name: "@relkit/integrations",
        source: 'import "@relkit/provider";',
        dependencies: { "@relkit/provider": "workspace:*" },
      },
      { path: "packages/provider", name: "@relkit/provider", source: "" },
    ]),
    expected: {
      path: "integrations/catalog/package.json",
      owner: "@relkit/integrations",
      rule: "catalog-non-integration-dependency",
    },
  },
  ...["hono", "@pulumi/pulumi"].map((dependency) => ({
    name: `graph imports ${dependency}`,
    files: packageFiles([
      {
        path: "packages/graph",
        name: "@relkit/graph",
        source: `import "${dependency}";`,
        dependencies: { [dependency]: "test" },
      },
    ]),
    expected: {
      path: "packages/graph/src/index.ts",
      owner: "@relkit/graph",
      rule: "graph-hono-pulumi-import",
    },
  })),
  ...["@relkit/app", "@relkit/engine"].map((dependency) => ({
    name: `inspector imports ${dependency}`,
    files: packageFiles([
      {
        path: "apps/inspector",
        name: "inspector",
        source: `import "${dependency}";`,
        dependencies: { [dependency]: "workspace:*" },
      },
    ]),
    expected: {
      path: "apps/inspector/src/index.ts",
      owner: "apps/inspector",
      rule: "inspector-runtime-application-import",
    },
  })),
  ...["effect", "hono", "next", "@pulumi/pulumi", "@aws-sdk/client-s3", "@relkit/compiler"].map(
    (dependency) => ({
      name: `fixture imports ${dependency}`,
      files: packageFiles([
        {
          path: "examples/commerce",
          name: "commerce-example",
          source: `import "${dependency}";`,
          dependencies: { [dependency]: "test" },
        },
      ]),
      expected: {
        path: "examples/commerce/src/index.ts",
        owner: "examples/commerce",
        rule: "fixture-template-internal-import",
      },
    }),
  ),
  {
    name: "template imports an internal package",
    files: {
      "templates/default/src/index.ts": 'import "@relkit/compiler";\nexport {};\n',
    },
    expected: {
      path: "templates/default/src/index.ts",
      owner: "templates/default",
      rule: "fixture-template-internal-import",
    },
  },
];
