/**
 * Development builds run the generated TypeScript entry directly: a development build, and
 * the saves `relkit dev` makes afterwards, write no production bundle (`server/index.js`).
 */
import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildProject } from "../../src/commands/build.js";
import { createDevFixture, functionSource, startDev } from "./dev-reload.fixture.js";

const fixture = createDevFixture();

afterAll(() => fixture.remove(), 60_000);

test(
  "a development build writes the entry but no bundle",
  async () => {
    const buildDirectory = join(fixture.root, ".relkit/dev-build");
    const built = await buildProject({
      projectRoot: fixture.root,
      mode: "development",
      buildDirectory,
    });
    expect(built.ok).toBe(true);
    expect(existsSync(join(buildDirectory, "server/index.ts"))).toBe(true);
    expect(existsSync(join(buildDirectory, "server/index.js"))).toBe(false);
  },
  { timeout: 300_000 },
);

test(
  "no bundle is written on save",
  async () => {
    const dev = await startDev(fixture.root);
    try {
      await dev.waitFor("/a1", "a1 v0");
      fixture.write("src/services/alpha/functions/a1.function.ts", functionSource("a1", "v1"));
      await dev.waitFor("/a1", "a1 v1");
      const bundles = [
        ...new Bun.Glob(".relkit/generated/**/server/index.js").scanSync({
          cwd: fixture.root,
          dot: true,
        }),
      ];
      expect(bundles).toEqual([]);
      const entries = [
        ...new Bun.Glob(".relkit/generated/**/server/index.ts").scanSync({
          cwd: fixture.root,
          dot: true,
        }),
      ];
      expect(entries.length).toBeGreaterThan(0);
    } finally {
      await dev.stop();
    }
  },
  { timeout: 300_000 },
);
