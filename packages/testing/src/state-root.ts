import type { TestStateRoot } from "./state-root.types.js";
export type { TestStateRoot } from "./state-root.types.js";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

/**
 * Creates an owned temporary state root, or opens a caller-owned restart root.
 * @param requestedPath - Explicit caller-owned restart root or absent temporary-root request.
 * @returns The native path and exactly-once temporary ownership cleanup hook.
 */
export function createTestStateRoot(requestedPath?: string): TestStateRoot {
  if (requestedPath !== undefined) {
    const path = resolve(requestedPath);
    if (path === resolve("/") || path.length === 0) {
      throw new TypeError("Test state root must be a specific directory");
    }
    mkdirSync(path, { recursive: true });
    return Object.freeze({ path, cleanup: () => undefined });
  }

  const workspaceRoot = mkdtempSync(join(tmpdir(), "relkit-test-"));
  const path = join(workspaceRoot, ".relkit", "state");
  try {
    mkdirSync(path, { recursive: true });
  } catch (error) {
    rmSync(workspaceRoot, { recursive: true, force: true });
    throw error;
  }
  let cleaned = false;

  return Object.freeze({
    path,
    cleanup: (failed: boolean) => {
      if (cleaned) return;
      cleaned = true;
      if (failed && process.env.RELKIT_KEEP_TEST_STATE === "1") {
        console.warn(`RELKIT_KEEP_TEST_STATE=1 retained test state at ${path}`);
        return;
      }
      rmSync(workspaceRoot, { recursive: true, force: true });
    },
  });
}
