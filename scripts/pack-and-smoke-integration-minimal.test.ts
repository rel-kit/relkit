import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { copyExternalDependencies } from "./pack-and-smoke-integration-minimal.ts";

test("copies installed platform optional dependencies for packed exports", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-packed-optional-"));
  const repositoryRoot = join(root, "repository");
  const fixture = join(root, "fixture");
  const host = join(repositoryRoot, "node_modules", "host");
  const native = join(host, "node_modules", "native-platform");
  try {
    await mkdir(native, { recursive: true });
    await writeFile(
      join(host, "package.json"),
      JSON.stringify({
        name: "host",
        optionalDependencies: { "native-platform": "1", "other-platform": "1" },
      }),
    );
    await writeFile(join(native, "package.json"), JSON.stringify({ name: "native-platform" }));
    await writeFile(join(native, "binding.node"), "native fixture");

    await copyExternalDependencies(fixture, new Set(["host"]), repositoryRoot, []);

    expect(
      await readFile(join(fixture, "node_modules", "native-platform", "binding.node"), "utf8"),
    ).toBe("native fixture");
    await expect(access(join(fixture, "node_modules", "other-platform"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
