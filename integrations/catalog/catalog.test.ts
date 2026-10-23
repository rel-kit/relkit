/** Keeps catalog discovery metadata-only without installing or evaluating integrations. */
import { expect, test } from "bun:test";
import manifest from "./package.json";
import * as catalog from "./src/index.js";

const integrations = [
  "redis",
  "s3",
  "docker",
  "local",
  "cloudflare",
  "sentry",
  "otlp",
  "aws",
  "pulumi",
  "inngest",
  "trigger",
  "effect-mq",
  "langchain",
] as const;

test("catalog exposes metadata without executable integration exports or dependencies", () => {
  expect(Object.keys(catalog)).toEqual([]);
  expect(Object.keys(manifest.exports)).toEqual(["."]);
  expect(manifest).not.toHaveProperty("dependencies");
  expect(manifest).not.toHaveProperty("optionalDependencies");
  expect(manifest).not.toHaveProperty("peerDependencies");
  expect(Object.entries(manifest.relkit.catalog).sort()).toEqual(
    integrations.map((name): [string, string] => [`./${name}`, `@relkit/${name}`]).sort(),
  );
});
