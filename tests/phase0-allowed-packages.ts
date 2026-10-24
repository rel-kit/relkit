/** Pure original allow-case inputs retain integration, catalog, application and public dependency direction. */
import { packageFiles } from "./phase0-contracts.js";
import type { Files } from "./phase0-harness.types.js";

export const allowedPackages: readonly [Files, Files] = [
  packageFiles([
    {
      path: "packages/app",
      name: "@relkit/app",
      source: 'import "@relkit/config";',
      dependencies: { "@relkit/config": "workspace:*" },
    },
    { path: "packages/config", name: "@relkit/config", source: "" },
  ]),
  packageFiles([
    { path: "packages/provider", name: "@relkit/provider", source: "" },
    { path: "packages/providers-local", name: "@relkit/providers-local", source: "" },
    {
      path: "integrations/packages/redis",
      name: "@relkit/redis",
      source:
        'import "@relkit/cache"; import "@relkit/contracts"; import "@relkit/provider"; import "ioredis";',
      dependencies: {
        "@relkit/cache": "workspace:*",
        "@relkit/contracts": "workspace:*",
        "@relkit/provider": "workspace:*",
        ioredis: "5.0.0",
      },
    },
    {
      path: "integrations/packages/s3",
      name: "@relkit/s3",
      source: 'import "@relkit/buckets"; import "@relkit/provider";',
      dependencies: {
        "@relkit/buckets": "workspace:*",
        "@relkit/provider": "workspace:*",
      },
    },
    {
      path: "integrations/packages/local",
      name: "@relkit/local",
      source: 'import "@relkit/provider"; import "@relkit/providers-local";',
      dependencies: {
        "@relkit/provider": "workspace:*",
        "@relkit/providers-local": "workspace:*",
      },
    },
    {
      path: "integrations/catalog",
      name: "@relkit/integrations",
      source: "export {};",
    },
    {
      path: "examples/commerce",
      name: "commerce-example",
      source: 'import "@relkit/redis"; import "@relkit/redis/runtime";',
      dependencies: {
        "@relkit/redis": "workspace:*",
      },
    },
  ]),
];
