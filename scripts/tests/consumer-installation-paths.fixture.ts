/** Real manifest-only fixtures for dependency path accounting, never native SDK substitutes. */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Writes a synthetic installed package with explicit actual identity and declared edges.
 * @param root - Owned consumer fixture directory.
 * @param name - Installed package directory and default identity.
 * @param dependencies - Manifest edges, resolved independently by the real collector.
 * @param identity - Actual manifest name for native package-alias coverage.
 * @returns Completed synchronous fixture setup.
 */
function installedPackage(
  root: string,
  name: string,
  dependencies: Readonly<Record<string, string>>,
  identity = name,
) {
  const directory = join(root, "node_modules", name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: identity, version: "1.0.0", dependencies }),
  );
}

/**
 * Shares a transitive dependency between a CLI and app so every real incoming route matters.
 * @returns Owned physical installation with only tiny manifests and no executable SDK code.
 */
export function installationPathsFixture() {
  const root = mkdtempSync(join(tmpdir(), "relkit-installation-paths-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "consumer",
      dependencies: {
        "@relkit/cli": "1.0.0",
        "fixture-app": "1.0.0",
        "safe-alias": "npm:react@1.0.0",
      },
    }),
  );
  installedPackage(root, "@relkit/cli", { "fixture-common": "1.0.0" });
  installedPackage(root, "fixture-app", { "fixture-common": "1.0.0" });
  installedPackage(root, "fixture-common", { react: "1.0.0" });
  installedPackage(root, "react", {});
  installedPackage(root, "safe-alias", {}, "react");
  return { root, close: () => rmSync(root, { recursive: true, force: true }) };
}
