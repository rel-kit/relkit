/** Prevents portable production installs from dropping selected native dependency repairs. */
import { expect, test } from "vitest";
import { buildProductionManifest } from "../src/commands/build-manifest.js";
import { dockerfile, dockerignore } from "../src/commands/build-container.js";
import { captureProductionRepairs } from "../src/commands/build-production-repairs.js";
import { Effect } from "effect";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

test("selected Drizzle copies byte-identical release repairs and exact patch registration", async () => {
  const dependencies = { "drizzle-orm": "1.0.0-rc.5-169397b" };
  const repair = await Effect.runPromise(captureProductionRepairs(dependencies));
  const canonical = await readFile(
    resolve(import.meta.dirname, "../../../patches/drizzle-orm.patch"),
    "utf8",
  );
  expect(repair.assets).toHaveLength(1);
  expect(repair.assets[0]?.content).toBe(canonical);
  expect(repair.assets[0]?.hash).toBe(createHash("sha256").update(canonical).digest("hex"));
  const manifest = JSON.parse(buildProductionManifest(dependencies, repair.patchedDependencies));
  expect(manifest.patchedDependencies).toEqual({
    "drizzle-orm@1.0.0-rc.5-169397b": repair.assets[0]?.path,
  });
});

test("unavailable selected repairs reject rather than publishing an unpatched cohort", async () => {
  await expect(
    Effect.runPromise(captureProductionRepairs({ "drizzle-orm": "99.0.0" })),
  ).rejects.toMatchObject({ operation: "build.productionPatch" });
  expect(() => buildProductionManifest({ "drizzle-orm": "1.0.0-rc.5-169397b" })).toThrow(
    "repair is missing",
  );
  expect(await Effect.runPromise(captureProductionRepairs({}))).toEqual({
    patchedDependencies: {},
    assets: [],
  });
});

test("selected native auth retains the canonical official fetch override", () => {
  const manifest = JSON.parse(
    buildProductionManifest({ "@relkit/better-auth": "0.7.10", "better-auth": "1.7.1" }),
  );
  expect(manifest.overrides).toEqual({ "@better-fetch/fetch": "1.3.2" });
  expect(manifest.pnpm).toEqual({ overrides: { "@better-fetch/fetch": "1.3.2" } });
  expect(manifest.dependencies["@cloudflare/workers-types"]).toBeUndefined();
});

test("minimal production leaves unselected native repairs absent", () => {
  const manifest = JSON.parse(buildProductionManifest({}));
  expect(manifest.overrides).toBeUndefined();
  expect(manifest.patchedDependencies).toBeUndefined();
});

test("selected patch assets enter the image before production installation", () => {
  const source = dockerfile(false, true);
  expect(source).toContain("COPY patches/ ./patches/");
  expect(source.indexOf("COPY patches/")).toBeLessThan(source.indexOf("RUN bun install"));
  expect(dockerignore(false, true)).toContain("!patches/**");
  expect(dockerfile()).not.toContain("COPY patches/");
  expect(dockerignore()).not.toContain("!patches/**");
});
