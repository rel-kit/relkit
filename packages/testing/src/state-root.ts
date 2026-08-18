import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

export interface TestStateRoot {
  readonly path: string;
  readonly cleanup: (failed: boolean) => void;
}

/** Creates an owned temporary state root, or opens a caller-owned restart root. */
export function createTestStateRoot(requestedPath?: string): TestStateRoot {
  if (requestedPath !== undefined) {
    const path = resolve(requestedPath);
    if (path === resolve("/") || path.length === 0) {
      throw new TypeError("Test state root must be a specific directory");
    }
    mkdirSync(path, { recursive: true });
    return Object.freeze({ path, cleanup: () => undefined });
  }

  const workspaceRoot = mkdtempSync(join(tmpdir(), "zsys-test-"));
  const path = join(workspaceRoot, ".zsys", "state");
  mkdirSync(path, { recursive: true });
  let cleaned = false;

  return Object.freeze({
    path,
    cleanup: (failed: boolean) => {
      if (cleaned) return;
      cleaned = true;
      if (failed && process.env.ZSYS_KEEP_TEST_STATE === "1") {
        console.warn(`ZSYS_KEEP_TEST_STATE=1 retained test state at ${path}`);
        return;
      }
      rmSync(workspaceRoot, { recursive: true, force: true });
    },
  });
}
