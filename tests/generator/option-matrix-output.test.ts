/**
 * Verifies JSON creation output, safe formatting and explicit cloud/deployment
 * selection. Decoded metadata is read from published fixtures; fake process
 * authority keeps these option tests free of cloud or installation work.
 */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Schema } from "effect";
import {
  generateProject,
  normalizeCreateOptions,
  formatGenerateResult,
} from "../../packages/create-relkit/src/index.ts";
import appManifest from "../../packages/app/package.json" with { type: "json" };
import { makeRoot, contextFor, createOptions } from "./option-matrix-fixture.js";
import { GeneratedManifest, GeneratedOutput } from "./option-matrix.schemas.js";

const JSON_CREATE_ARGUMENTS = [
  "@scope/json-app",
  "--template=agent",
  "--cloud",
  "none",
  "--deploy=none",
  "--no-install",
  "--no-git",
  "--no-examples",
  "--directory",
  "projects/json-app",
  "--force-empty-directory",
  "--json",
];

test("normalizes JSON options and keeps generated results JSON-safe", async () => {
  expect(normalizeCreateOptions(["default-app"])).toMatchObject({
    cloud: "none",
    deploy: "none",
  });
  const options = normalizeCreateOptions(JSON_CREATE_ARGUMENTS, { json: false });
  expect(options).toMatchObject({
    name: "@scope/json-app",
    template: "agent",
    cloud: "none",
    deploy: "none",
    install: false,
    git: false,
    examples: false,
    directory: "projects/json-app",
    forceEmptyDirectory: true,
    json: true,
  });

  const root = await makeRoot();
  const result = await generateProject(options, contextFor(root));
  const json = Schema.decodeUnknownSync(GeneratedOutput)(JSON.parse(JSON.stringify(result)));
  expect(json).toMatchObject({
    ok: true,
    name: "@scope/json-app",
    installed: false,
    gitInitialized: false,
  });
  expect(json.nextSteps.endpoints).not.toHaveProperty("route");
  expect(json.nextSteps.endpoints).toMatchObject({
    openapi: "http://localhost:3000/_relkit/v1/openapi.json",
    apiReference: "http://localhost:3000/_relkit/v1/api-reference",
  });
  expect(formatGenerateResult(json)).toContain("api docs:");
  expect(formatGenerateResult(json)).toContain(
    `Success! Created @scope/json-app at ${result.destination}.`,
  );
  expect(formatGenerateResult(json)).not.toContain("route:");
});

test("adds AWS and Pulumi only when explicitly selected", async () => {
  const root = await makeRoot();
  const result = await generateProject(
    createOptions("deployed-app", {
      cloud: "aws",
      deploy: "pulumi",
      install: false,
      git: false,
    }),
    contextFor(root),
  );
  const manifest = Schema.decodeUnknownSync(GeneratedManifest)(
    JSON.parse(await readFile(join(result.destination, "package.json"), "utf8")),
  );
  const config = await readFile(join(result.destination, "relkit.config.ts"), "utf8");
  expect(manifest.dependencies).toMatchObject({
    "@relkit/app": appManifest.version,
    "@relkit/aws": appManifest.version,
    "@relkit/pulumi": appManifest.version,
  });
  expect(manifest.scripts).toMatchObject({
    "deploy:preview": "relkit deploy preview",
    deploy: "relkit deploy up",
  });
  expect(config).toContain('import "@relkit/aws";');
  expect(config).toContain('import "@relkit/pulumi";');
  expect(config).toContain('deployment: { engine: "pulumi", host: "aws" }');
});
