import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test } from "bun:test";
import { resolveRestartStateRoot } from "./state-root.ts";

test("restart workers accept owned fixtures and reject outside paths, traversal, and symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "relkit-restart-events-"));
  const unrelated = mkdtempSync(join(tmpdir(), "relkit-unrelated-"));
  const link = `${root}Link`;
  try {
    symlinkSync(root, link, "dir");
    expect(resolveRestartStateRoot(root)).toBe(root);
    for (const path of [
      "",
      "/",
      tmpdir(),
      unrelated,
      join(unrelated, basename(root)),
      `${root}/../${basename(root)}`,
      link,
    ]) {
      expect(() => resolveRestartStateRoot(path)).toThrow();
    }
    expect(existsSync(root)).toBe(true);
  } finally {
    rmSync(link, { force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(unrelated, { recursive: true, force: true });
  }
});
