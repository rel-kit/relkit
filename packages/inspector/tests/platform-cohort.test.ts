/** Guards the standalone tool's tested shared platform pin: a fresh resolver must not float it beyond the pinned Effect API. */
import { expect, test } from "vitest";
import manifest from "../package.json";
import repository from "../../../package.json";

test("standalone tool declares the shared platform SDK at its tested catalog version", () => {
  const dependencies: Readonly<Record<string, string>> = manifest.dependencies;
  const declaration = dependencies["@effect/platform-node-shared"];
  expect(declaration).toBeDefined();
  const version =
    declaration === "catalog:" ? repository.catalog["@effect/platform-node-shared"] : declaration;
  expect(version).toBe(repository.catalog["@effect/platform-node-shared"]);
});
