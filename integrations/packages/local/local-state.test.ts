import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLocalProjectIdentity,
  localStateDirectory,
  readProviderOverrides,
  removeProviderOverrides,
  writeProviderOverrides,
} from "./src/runtime/index.ts";

const planHash = `sha256:${"a".repeat(64)}`;

test("writes atomic restrictive overrides and returns only a safe generation summary", () => {
  const root = mkdtempSync(join(tmpdir(), "relkit-local-state-"));
  try {
    const identity = createLocalProjectIdentity(root, "commerce");
    const secret = "local-secret-value";
    const summary = writeProviderOverrides(identity, planHash, [
      { bindingId: "provider.cache.default", values: { url: `redis://:${secret}@127.0.0.1` } },
    ]);
    const directory = localStateDirectory(identity);
    const file = join(directory, "provider-overrides.json");

    expect(summary).toMatchObject({
      planHash,
      bindingIds: ["provider.cache.default"],
      generationId: expect.stringMatching(/^[a-f0-9-]{36}$/),
    });
    expect(JSON.stringify(summary)).not.toContain(secret);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(directory).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(readProviderOverrides(identity, planHash)?.bindings[0]?.values.url).toContain(secret);
    expect(() => readProviderOverrides(identity, `sha256:${"b".repeat(64)}`)).toThrow(
      expect.objectContaining({ code: "RELKIT_LOCAL_OVERRIDE_STALE" }),
    );

    removeProviderOverrides(identity);
    expect(readProviderOverrides(identity)).toBeUndefined();
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("rejects symlinked state paths without writing outside the project", () => {
  const root = mkdtempSync(join(tmpdir(), "relkit-local-state-root-"));
  const outside = mkdtempSync(join(tmpdir(), "relkit-local-state-outside-"));
  try {
    const identity = createLocalProjectIdentity(root, "commerce");
    symlinkSync(outside, join(root, ".relkit"));

    expect(() => readProviderOverrides(identity)).toThrow(
      expect.objectContaining({ code: "RELKIT_LOCAL_STATE_INVALID" }),
    );
    expect(() =>
      writeProviderOverrides(identity, planHash, [
        { bindingId: "provider.cache.default", values: { url: "redis://127.0.0.1:6379" } },
      ]),
    ).toThrow(expect.objectContaining({ code: "RELKIT_LOCAL_STATE_INVALID" }));
    expect(readdirSync(outside)).toEqual([]);
  } finally {
    rmSync(root, { force: true, recursive: true });
    rmSync(outside, { force: true, recursive: true });
  }
});
