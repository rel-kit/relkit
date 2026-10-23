/**
 * Compiles the emitted core runtime declaration surface with optional HTTP SDK
 * resolution withheld. This checks real declarations with skipLibCheck=false;
 * it does not substitute SDK modules or represent an external packed install.
 */
import { expect, test } from "vitest";
import ts from "typescript";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { Schema } from "effect";
import { HTTP_TRANSPORT_REQUIREMENTS } from "../src/selected-transports.js";

test("optional_transport_requirements_match_published_peer_ownership", () => {
  const manifest = Schema.decodeUnknownSync(
    Schema.fromJsonString(
      Schema.Struct({
        peerDependencies: Schema.Record(Schema.String, Schema.String),
        peerDependenciesMeta: Schema.Record(
          Schema.String,
          Schema.Struct({ optional: Schema.Boolean }),
        ),
        dependencies: Schema.Record(Schema.String, Schema.String),
      }),
    ),
  )(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"));
  for (const requirement of HTTP_TRANSPORT_REQUIREMENTS) {
    expect(manifest.peerDependencies[requirement.package]).toBe(requirement.supportedRange);
    expect(manifest.peerDependenciesMeta[requirement.package]?.optional).toBe(true);
    expect(manifest.dependencies[requirement.package]).toBeUndefined();
  }
});

test("core_declarations_do_not_reference_optional_transport_sdks", () => {
  const consumer = resolve(import.meta.dirname, "../../cli/optional-http-consumer.ts");
  const options: ts.CompilerOptions = {
    strict: true,
    skipLibCheck: false,
    noEmit: true,
    types: ["bun"],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const optional = /^(?:@modelcontextprotocol\/|@ag-ui\/|@scalar\/)/;
  const requested: string[] = [];
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile;
  host.getSourceFile = (path, target, onError, shouldCreate) =>
    path === consumer
      ? ts.createSourceFile(
          path,
          'import { createApp } from "@relkit/runtime-hono"; export type Core = typeof createApp;',
          target,
          true,
        )
      : read(path, target, onError, shouldCreate);
  host.resolveModuleNames = (names, from) =>
    names.map((name) => {
      requested.push(name);
      if (optional.test(name)) return undefined;
      return ts.resolveModuleName(name, from, options, host).resolvedModule;
    });
  const program = ts.createProgram([consumer], options, host);
  expect(
    ts
      .getPreEmitDiagnostics(program)
      .map((item) => ts.flattenDiagnosticMessageText(item.messageText, " ")),
  ).toEqual([]);
  expect(requested.filter((name) => optional.test(name))).toEqual([]);
  expect(
    program
      .getSourceFiles()
      .some((file) => file.fileName.endsWith("/runtime-hono/dist/index.d.ts")),
  ).toBe(true);
}, 30_000);
