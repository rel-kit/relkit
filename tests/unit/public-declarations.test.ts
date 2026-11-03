import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { scanPublicDeclarations } from "../../scripts/check-public-declarations.ts";

const areas = [
  "contracts",
  "schema",
  "config",
  "provider",
  "diagnostics",
  "functions",
  "services",
  "routes",
  "jobs",
  "events",
  "buckets",
  "cache",
  "tools",
  "agents",
  "app",
];

async function scan(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "relkit-declarations-"));
  try {
    const exports: Record<string, { types: string }> = {};
    for (const area of areas) {
      await mkdir(join(root, "packages/relkit/dist", area), { recursive: true });
      await writeFile(join(root, "packages/relkit/dist", area, "index.d.ts"), "export {};\n");
      exports[area === "app" ? "." : `./${area}`] = { types: `./dist/${area}/index.d.ts` };
    }
    await writeFile(join(root, "packages/relkit/package.json"), JSON.stringify({ exports }));
    await mkdir(join(root, "packages/testing/dist"), { recursive: true });
    await writeFile(
      join(root, "packages/testing/package.json"),
      JSON.stringify({ exports: { ".": { types: "./dist/index.d.ts" } } }),
    );
    await writeFile(join(root, "packages/testing/dist/index.d.ts"), "export {};\n");
    for (const [path, source] of Object.entries(files)) {
      const file = join(root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, source);
    }
    return scanPublicDeclarations(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("allows the documented native Effect constructors and injectable services", async () => {
  expect(
    await scan({
      "packages/relkit/dist/schema/index.d.ts": [
        'import type { Effect, Layer, Cause, Fiber, Schema } from "effect";',
        "export declare const validateEffect: () => Effect.Effect<string, Cause.Cause<Error>>;",
        "export declare const SchemaValidatorLive: Layer.Layer<unknown>;",
        "export type NativeSchema = Schema.Schema<string>;",
        "export type ValidationFiber = Fiber.Fiber<string, Error>;",
      ].join("\n"),
    }),
  ).toEqual([]);
});

test("follows split Next middleware types within the existing middleware exception", async () => {
  expect(
    await scan({
      "packages/relkit/dist/routes/index.d.ts": 'export * from "./define-middleware.js";',
      "packages/relkit/dist/routes/define-middleware.d.ts":
        'export type { MiddlewareHandler } from "./define-middleware.types.js";',
      "packages/relkit/dist/routes/define-middleware.types.d.ts":
        'import type { Next } from "hono"; export type MiddlewareHandler = () => ReturnType<Next>;',
    }),
  ).toEqual([]);
});

test("still rejects unrelated framework, cloud, and internal provider declarations", async () => {
  const findings = await scan({
    "packages/relkit/dist/functions/index.d.ts": [
      'export type { Context as HonoContext } from "hono";',
      'export type { NextRequest } from "next/server";',
      'export type { Output as Pulumi } from "@pulumi/pulumi";',
      'export type { S3Client } from "@aws-sdk/client-s3";',
      'export type { Engine } from "relkit/engine";',
    ].join("\n"),
  });
  for (const symbol of [
    "Hono",
    "Pulumi",
    "cloud-client",
    "internal-provider-sdk",
    "framework-or-provider-import",
  ])
    expect(findings.some((finding) => finding.symbol === symbol)).toBe(true);
});
