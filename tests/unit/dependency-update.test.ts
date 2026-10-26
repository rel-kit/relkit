/** Exercises dependency ownership and rejects conflicting catalog updates before any files are written. */
import { expect, test } from "bun:test";
import { catalogUpdates, dependencyUpdatePath } from "../../scripts/dependency-update-policy.ts";

test("npm template security updates change the owning catalog while independent pins stay local", () => {
  expect(
    catalogUpdates({ next: "16.3.8", zod: "4.6.5" }, { next: "16.3.8", zod: "4.6.5" }, [
      { before: { dependencies: { next: "16.3.8" } }, after: { dependencies: { next: "16.4.1" } } },
      {
        before: { dependencies: { zod: "4.6.5", mysql2: "3.14.1" } },
        after: { dependencies: { zod: "4.6.6", mysql2: "3.23.1" } },
      },
    ]),
  ).toEqual({ next: "16.4.1", zod: "4.6.6" });
});

test("conflicting pins and nonexact catalog proposals fail instead of picking a winner", () => {
  const changed = {
    before: { dependencies: { next: "16.3.8" } },
    after: { dependencies: { next: "16.4.1" } },
  };
  expect(() => catalogUpdates({ next: "16.3.8" }, { next: "16.5.0" }, [changed])).toThrow(
    "Conflicting",
  );
  expect(() =>
    catalogUpdates({ next: "16.3.8" }, { next: "16.3.8" }, [
      { ...changed, after: { dependencies: { next: "^16.4.1" } } },
    ]),
  ).toThrow("exact");
  expect(catalogUpdates({ next: "16.3.8" }, { next: "16.4.1" }, [changed])).toEqual({
    next: "16.4.1",
  });
});

test("bot output is restricted to dependency data and the generated catalog", () => {
  for (const path of [
    "package.json",
    "bun.lock",
    "packages/drizzle/package.json",
    "integrations/packages/s3/package.json",
    "templates/default/v1/fullstack/package.json",
    "integrations/packages/effect-mq/src/build-catalog.ts",
  ])
    expect(dependencyUpdatePath(path)).toBe(true);
  for (const path of [
    ".github/workflows/ci.yml",
    "../package.json",
    "packages/../../package.json",
    "/package.json",
    "packages/cli/src/bin.ts",
    "openspec/changes/archive/example/package.json",
  ])
    expect(dependencyUpdatePath(path)).toBe(false);
});
