/** Pure admission and native scaffold-fence rules for source/config watch batches. */
import { readdirSync } from "node:fs";

/**
 * Excludes generated, dependency and owned transaction paths from source activation.
 * @param file - Project-relative portable path.
 * @returns Whether the native event must be ignored.
 */
export function ignoredWatchPath(file: string): boolean {
  return (
    file === "" ||
    file === ".env" ||
    file === ".env.local" ||
    file.startsWith("node_modules/") ||
    file.startsWith(".relkit/") ||
    /^\.relkit-scaffold-/.test(file) ||
    /\.relkit-[\da-f-]+\.tmp$/.test(file)
  );
}

/**
 * Checks whether a live scaffold transaction currently fences generation publication.
 * @param root - Authored project root.
 * @returns Whether an identified live scaffold process owns a fence.
 */
export function activeScaffoldWatchFence(root: string): boolean {
  return readdirSync(root).some((file) => {
    const match = /^\.relkit-scaffold-(\d+)-[\da-f-]+\.tmp$/.exec(file);
    if (!match || Number(match[1]) <= 0) return false;
    try {
      process.kill(Number(match[1]), 0);
      return true;
    } catch (error) {
      return !(error instanceof Error && "code" in error && error.code === "ESRCH");
    }
  });
}
