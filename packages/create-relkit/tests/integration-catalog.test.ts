/** Keeps the integration catalog bundled into the creator equal to the released integration packages. */
import { expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundledIntegration, bundledIntegrations } from "../src/integration-catalog.js";

const root = resolve(import.meta.dir, "../../..");

/** Reads every workspace package that declares integration metadata. */
function workspaceIntegrations() {
  return ["packages", "integrations/packages"]
    .flatMap((parent) => readdirSync(join(root, parent)).map((name) => join(root, parent, name)))
    .filter((directory) => existsSync(join(directory, "package.json")))
    .map((directory) => JSON.parse(readFileSync(join(directory, "package.json"), "utf8")))
    .filter((manifest) => typeof manifest.relkit?.integration?.id === "string")
    .map((manifest) => ({
      id: manifest.relkit.integration.id,
      package: manifest.name,
      maturity: manifest.relkit.maturity,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

test("the bundled catalog lists every released integration with its maturity", () => {
  expect(bundledIntegrations()).toEqual(workspaceIntegrations());
  expect(bundledIntegration("@relkit/redis")).toMatchObject({ id: "redis", maturity: "core" });
  expect(bundledIntegration("@relkit/cli")).toBeUndefined();
});
