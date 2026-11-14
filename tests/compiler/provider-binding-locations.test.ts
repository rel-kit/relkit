/**
 * Provider binding diagnostics and graph nodes point at the binding's entry in the configuration,
 * and environment variable nodes at their key in the `defineEnv` call, not at `defineApp(`.
 */
import { expect, test } from "bun:test";
import { defineApp } from "../../packages/relkit/src/app/define-app.ts";
import { defineEnv, env } from "relkit/config";
import { NORMALIZE_CODES, normalizeCompilation } from "../../packages/cli/src/compiler/index.ts";
import { docker } from "../../integrations/packages/docker/src/index.ts";
import { s3 } from "../../integrations/packages/s3/src/index.ts";

const config = [
  'import { defineApp } from "relkit";',
  'import { docker } from "@relkit/docker";',
  'import { s3 } from "@relkit/s3";',
  'import env from "./src/platform/env.js";',
  "",
  "// The application of the audit: the binding sits lines below the defineApp( call.",
  "",
  "",
  "export default defineApp({",
  '  id: "logistics",',
  "  env,",
  "  bucket: {",
  '    "local": docker(s3()),',
  "  },",
  "});",
  "",
].join("\n");

const environment = [
  'import { defineEnv, env } from "relkit/config";',
  "",
  "export default defineEnv({",
  "  DATABASE_URL: env.url(),",
  '  "SESSION_SECRET": env.secret(),',
  "});",
  "",
].join("\n");

const sources = [
  { fileName: "relkit.config.ts", text: config },
  { fileName: "src/platform/env.ts", text: environment },
];

const app = defineApp({
  id: "logistics",
  env: defineEnv({ DATABASE_URL: env.url(), SESSION_SECRET: env.secret() }),
  bucket: { local: docker(s3()) },
});

function compile(mode: "development" | "production") {
  return normalizeCompilation({
    descriptors: [
      {
        descriptor: app,
        exportName: "default",
        source: { file: "relkit.config.ts", line: 9, column: 16 },
      },
    ],
    sources,
    mode,
  });
}

test("a local-only bucket is reported at its entry with what to write instead", () => {
  const diagnostic = compile("production").diagnostics.find(
    (entry) => entry.code === NORMALIZE_CODES.providerReleaseSource,
  );
  expect(diagnostic).toMatchObject({
    file: "relkit.config.ts",
    line: 13,
    column: 5,
    message:
      'Provider binding "provider.bucket.local" is local-only, so a release build has no source for it.',
  });
  expect(diagnostic?.suggestion).toContain(
    'docker(s3({ endpoint: env.url("S3_ENDPOINT"), bucketName: env.string("S3_BUCKET"), … }))',
  );
  expect(diagnostic?.suggestion).toContain("infrastructure source");
});

test("binding and environment nodes point at their own declarations", () => {
  const nodes = compile("development").graph?.nodes ?? [];
  const source = (id: string) => nodes.find((node) => node.id === id)?.source;
  expect(source("provider.bucket.local")).toEqual({
    file: "relkit.config.ts",
    line: 13,
    column: 5,
  });
  expect(source("DATABASE_URL")).toEqual({ file: "src/platform/env.ts", line: 4, column: 3 });
  expect(source("SESSION_SECRET")).toEqual({ file: "src/platform/env.ts", line: 5, column: 3 });
});
