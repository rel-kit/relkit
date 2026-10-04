import { afterEach, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withRelkit } from "../../src/build/next.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/**
 * Creates an isolated temporary project for build-adapter assertions.
 * @returns The temporary project directory owned by the calling test.
 */
async function project() {
  const parent = await mkdtemp(join(tmpdir(), "relkit-next-config-"));
  roots.push(parent);
  const root = join(parent, "app");
  await mkdir(join(root, ".relkit/generated"), { recursive: true });
  await mkdir(join(root, "node_modules/@relkit"), { recursive: true });
  await writeFile(
    join(root, ".relkit/generated/client-manifest.json"),
    JSON.stringify({ publicFingerprint: "test-fingerprint" }),
  );
  return { parent, root };
}

test("Next config includes linked client packages in Turbopack's filesystem root", async () => {
  const { parent, root } = await project();
  const client = join(parent, "framework/packages/client");
  await mkdir(client, { recursive: true });
  await symlink(client, join(root, "node_modules/@relkit/client"));
  const config = withRelkit({ turbopack: { resolveAlias: { example: "replacement" } } }, { root });
  expect(config.turbopack).toEqual({
    root: realpathSync(parent),
    resolveAlias: { example: "replacement" },
  });
  expect(config.env?.NEXT_PUBLIC_RELKIT_PUBLIC_FINGERPRINT).toBe("test-fingerprint");
});

test("Next config preserves an explicit Turbopack root", async () => {
  const { parent, root } = await project();
  const client = join(parent, "framework/client");
  await mkdir(client, { recursive: true });
  await symlink(client, join(root, "node_modules/@relkit/client"));
  expect(
    withRelkit({ turbopack: { root, resolveAlias: { example: "replacement" } } }, { root })
      .turbopack,
  ).toEqual({ root, resolveAlias: { example: "replacement" } });
});

test("Next config leaves ordinary local installations unchanged", async () => {
  const { root } = await project();
  await mkdir(join(root, "node_modules/@relkit/client"));
  expect(withRelkit({}, { root }).turbopack).toBeUndefined();
});
