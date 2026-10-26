/** Owns small real filesystem graphs for collector mechanics, never native SDK acceptance. */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ConsumerInstallation } from "../consumer-installation.types.js";

/**
 * Creates real package files whose import edges are supplied independently by each test.
 * @param count - Number of uniquely owned package modules.
 * @returns Owned files and installation records; close removes only this fixture root.
 */
export function moduleGraphFixture(count = 2) {
  const root = mkdtempSync(join(tmpdir(), "relkit-module-paths-"));
  const entry = join(root, "entry.js");
  writeFileSync(entry, "export const consumer = true;");
  const modules = Array.from({ length: count }, (_, index) => {
    const directory = join(root, "node_modules", `fixture-${index}`);
    mkdirSync(directory, { recursive: true });
    const file = join(directory, "index.js");
    writeFileSync(file, `export const fixture = ${index};`);
    return file;
  });
  const installation: ConsumerInstallation = {
    instances: modules.map((file, index) => ({
      name: `fixture-${index}`,
      version: "1.0.0",
      physicalPath: realpathSync(dirname(file)),
      logicalBytes: 0,
      physicalBytes: 0,
      archive: null,
      nativeFiles: [],
    })),
    paths: [],
    edges: [],
    missing: [],
  };
  return {
    root,
    entry,
    modules,
    installation,
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}
