/**
 * The generated context registry carries the profile names of the application's providers, so
 * `profile` in a bucket, cache, event or channel is typed by them.
 */
import { expect, it } from "vitest";
import { generateContextRegistry } from "../../src/compiler/context-registry.js";

const application = {
  exportName: "default",
  reference: { module: "relkit.config.ts" },
  descriptor: { kind: "app", id: "app" },
};

it("declares the profile names from the application's descriptor", () => {
  const registry = generateContextRegistry([application] as never, { projectRoot: "/app" });
  expect(registry).toContain(
    'type RelkitApplicationProfiles = import("relkit/config").ApplicationProfilesOf<typeof import("../../relkit.config.js")["default"]>;',
  );
  expect(registry).toContain(
    "    interface ApplicationProfiles extends RelkitApplicationProfiles {}",
  );
  expect(registry.indexOf("type RelkitApplicationProfiles")).toBeLessThan(
    registry.indexOf("declare global {"),
  );
});

it("declares no profile names without an application descriptor", () => {
  const registry = generateContextRegistry([] as never, { projectRoot: "/app" });
  expect(registry).not.toContain("ApplicationProfiles");
});
