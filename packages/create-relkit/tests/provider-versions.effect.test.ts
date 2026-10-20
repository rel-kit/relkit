import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";
import { customizeDeploymentManifestEffect } from "../src/generate-deployment-manifest.js";
import { buildCatalogProvider } from "../src/build-catalog.js";
import { normalizeCreateOptions } from "../src/options.js";
import { memoryFileSystem } from "./generator-services.fixture.js";

vi.mock("../package.json", async (original) => {
  const value = await original<{ default: { relkit: Record<string, unknown> } }>();
  return {
    default: {
      ...value.default,
      relkit: {
        ...value.default.relkit,
        providerVersions: {
          "@relkit/aws": "1.2.3",
          "@relkit/pulumi": "2.3.4",
          "@relkit/docker": "3.4.5",
          "@relkit/local": "4.5.6",
          "@relkit/inngest": "5.6.7",
        },
      },
    },
  };
});

it.effect(
  "generates selected providers with their own versions and preserves application pins",
  () =>
    Effect.gen(function* () {
      const root = "/memory/scoped";
      const fixture = yield* memoryFileSystem({
        [root + "/package.json"]: JSON.stringify({
          private: true,
          dependencies: { "@relkit/app": "0.8.0" },
          scripts: { test: "bun test" },
          custom: "preserved",
        }),
      });
      const options = normalizeCreateOptions([
        "scoped",
        "--cloud",
        "aws",
        "--deploy",
        "pulumi",
        "--jobs",
        "inngest-docker",
        "--no-install",
        "--no-git",
      ]);
      yield* customizeDeploymentManifestEffect(root, options).pipe(Effect.provide(fixture.layer));
      const saved = (yield* fixture.snapshot).get(root + "/package.json");
      expect(saved).toBeDefined();
      const manifest = JSON.parse(saved!.content);
      expect(manifest.dependencies).toEqual({
        "@relkit/app": "0.8.0",
        "@relkit/aws": "1.2.3",
        "@relkit/pulumi": "2.3.4",
        "@relkit/docker": "3.4.5",
        "@relkit/local": "4.5.6",
        "@relkit/inngest": "5.6.7",
      });
      expect(manifest.custom).toBe("preserved");
      expect(manifest.scripts.test).toBe("bun test");
      expect(manifest.scripts["deploy:preview"]).toBe("relkit deploy preview");
    }),
);

it.effect("missing provider metadata fails rather than borrowing the app version", () =>
  Effect.sync(() => {
    expect(() => buildCatalogProvider("@relkit/unknown")).toThrow("no concrete version");
  }),
);
