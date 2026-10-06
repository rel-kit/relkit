import { Effect } from "effect";
import type { FileSystemCapabilities } from "../../src/services/filesystem.types.js";

/**
 * Builds a strict deterministic filesystem double with explicit method ownership.
 * @param overrides - Only the capabilities exercised by this scenario.
 * @returns A complete capability rejecting every unexpected operation as a defect.
 */
export function testFiles(overrides: Partial<FileSystemCapabilities> = {}): FileSystemCapabilities {
  const unsupported = () => Effect.die(new Error("Unexpected filesystem authority"));
  return {
    readText: unsupported,
    writeText: unsupported,
    writeExclusive: unsupported,
    chmod: unsupported,
    mkdir: unsupported,
    remove: unsupported,
    copy: unsupported,
    rename: unsupported,
    stage: unsupported,
    symlink: unsupported,
    unlink: unsupported,
    stat: unsupported,
    exists: unsupported,
    files: unsupported,
    ...overrides,
  };
}
