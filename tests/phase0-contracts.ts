/** Constructs plain synthetic manifest/source inputs for native boundary probes without acquiring resources. */
import type { Files, PackageInput } from "./phase0-harness.types.js";

/** Serializes exact declared package dependencies.
 * @param name - Synthetic native package name.
 * @param dependencies - Exact explicit dependency declarations.
 * @returns Original portable manifest text. */
export function manifest(name: string, dependencies: Record<string, string> = {}): string {
  return JSON.stringify({ name, private: true, type: "module", dependencies }, null, 2);
}

/** Maps synthetic packages to original manifest and source bytes.
 * @param packages - Pure fixture descriptions in declaration order.
 * @returns Repository-relative files preserving the original export sentinel. */
export function packageFiles(packages: readonly PackageInput[]): Files {
  return Object.fromEntries(
    packages.flatMap(({ path, name, source, dependencies }) => [
      [`${path}/package.json`, manifest(name, dependencies)],
      [`${path}/src/index.ts`, `${source}\nexport {};\n`],
    ]),
  );
}
