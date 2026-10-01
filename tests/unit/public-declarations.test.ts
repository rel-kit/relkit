import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { scanPublicDeclarations } from "../../scripts/check-public-declarations.ts";

const packages = [
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
  "testing",
];

async function scan(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "relkit-declarations-"));
  try {
    for (const name of packages) {
      const directory = join(root, "packages", name);
      await mkdir(join(directory, "dist"), { recursive: true });
      await writeFile(
        join(directory, "package.json"),
        JSON.stringify({
          exports: { ".": { types: "./dist/index.d.ts" } },
        }),
      );
      await writeFile(join(directory, "dist/index.d.ts"), "export {};\n");
    }
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
      "packages/schema/dist/index.d.ts": [
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
      "packages/routes/dist/index.d.ts": 'export * from "./define-middleware.js";',
      "packages/routes/dist/define-middleware.d.ts":
        'export type { MiddlewareHandler } from "./define-middleware.types.js";',
      "packages/routes/dist/define-middleware.types.d.ts":
        'import type { Next } from "hono"; export type MiddlewareHandler = () => ReturnType<Next>;',
    }),
  ).toEqual([]);
});

test("still rejects unrelated framework, cloud, and internal provider declarations", async () => {
  const findings = await scan({
    "packages/functions/dist/index.d.ts": [
      'export type { Context as HonoContext } from "hono";',
      'export type { NextRequest } from "next/server";',
      'export type { Output as Pulumi } from "@pulumi/pulumi";',
      'export type { S3Client } from "@aws-sdk/client-s3";',
      'export type { Engine } from "@relkit/engine";',
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
