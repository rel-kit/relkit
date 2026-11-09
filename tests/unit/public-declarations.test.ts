import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  scanGeneratedDeclarations,
  scanPublicDeclarations,
} from "../../scripts/check-public-declarations.ts";

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

/** A stand-in `effect` package, so fixtures cover resolved as well as unresolved imports. */
const effectPackage = {
  "node_modules/effect/package.json": JSON.stringify({ name: "effect", types: "index.d.ts" }),
  "node_modules/effect/index.d.ts":
    "export declare namespace Effect { interface Effect<A, E = never, R = never> { readonly a: A; readonly e: E; readonly r: R } }\n",
};

async function scan(
  files: Record<string, string>,
  generated?: (root: string) => ReturnType<typeof scanGeneratedDeclarations>,
) {
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
    return generated ? generated(root) : scanPublicDeclarations(root);
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

test("rejects a root export whose types reach Effect, through local declarations", async () => {
  const findings = await scan({
    ...effectPackage,
    "packages/relkit/dist/app/index.d.ts": [
      'export { defineThing } from "./define-thing.js";',
      'export type { Unresolved } from "./unresolved.js";',
    ].join("\n"),
    "packages/relkit/dist/app/define-thing.d.ts": [
      'import type { ThingOptions } from "./thing-options.js";',
      "export declare function defineThing(options: ThingOptions): void;",
    ].join("\n"),
    "packages/relkit/dist/app/thing-options.d.ts": [
      'import type { Effect } from "effect";',
      "export interface ThingOptions { readonly run: () => Effect.Effect<string> }",
    ].join("\n"),
    "packages/relkit/dist/app/unresolved.d.ts":
      'export type { Layer as Unresolved } from "@effect/not-installed";',
  });
  const effect = findings.filter((finding) => finding.symbol.startsWith("effect-type"));
  expect(effect.map((finding) => finding.symbol)).toEqual([
    "effect-type: defineThing > ThingOptions > Effect (effect)",
    "effect-type: Unresolved (@effect/not-installed)",
  ]);
  // Each finding points at the root export it starts from.
  expect(effect[0]?.file).toBe("packages/relkit/dist/app/index.d.ts");
});

test("accepts a root with structural Effect results, private Effect members and Effect-free names", async () => {
  expect(
    await scan({
      ...effectPackage,
      "packages/relkit/dist/app/index.d.ts": [
        'import type { Effect } from "effect";',
        "export interface HandlerEffect<A> { readonly '~effect/Effect': { readonly _A: (_: never) => A } }",
        "export type ToolSideEffect = 'read' | 'write';",
        "export declare class Runner { private readonly run: Effect.Effect<void>; invoke(): Promise<void> }",
      ].join("\n"),
    }),
  ).toEqual([]);
});

test("rejects generated declarations that name a package type reaching Effect", async () => {
  const findings = await scan(
    {
      ...effectPackage,
      "app/.relkit/generated/context-registry.d.ts": [
        "declare global { namespace Relkit { interface ApplicationContextRegistry {",
        '  readonly leaky: import("../../lib/leaky.js").Leaky;',
        '  readonly own: typeof import("../../src/service.js")["default"];',
        "} } }",
        "export {};",
      ].join("\n"),
      "app/lib/leaky.d.ts": [
        'import type { Effect } from "effect";',
        "export type Leaky = Effect.Effect<number>;",
      ].join("\n"),
      // Application source may use Effect; the scan does not follow it.
      "app/src/service.ts": [
        'import type { Effect } from "effect";',
        "declare const service: { readonly run: Effect.Effect<number> };",
        "export default service;",
      ].join("\n"),
    },
    (root) => scanGeneratedDeclarations(root, join(root, "app")),
  );
  expect(findings.map((finding) => [finding.file, finding.symbol])).toEqual([
    ["app/.relkit/generated/context-registry.d.ts", "effect-type: Leaky > Effect (effect)"],
  ]);
});

test("requires generated declarations to scan", async () => {
  await expect(
    scan({}, (root) => scanGeneratedDeclarations(root, join(root, "app"))),
  ).rejects.toThrow("run relkit check");
});
