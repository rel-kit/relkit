/**
 * Exercises the serializable dependency contract used by integration manifests
 * and compiler plans. Capability/phase filtering must not activate unused peers;
 * malformed metadata is rejected before executable integration imports.
 */
import { describe, expect, it } from "vitest";
import { Effect, Schema } from "effect";
import {
  IntegrationDependencyRequirements,
  selectedIntegrationRequirements,
} from "../src/integration-dependencies.js";

const requirements = [
  {
    package: "redis",
    supportedRange: "^5.0.0",
    installSection: "dependencies",
    capabilities: ["cache", "realtime"],
    phases: ["check", "build", "runtime"],
  },
  {
    package: "@langchain/langgraph",
    supportedRange: "1.0.0-beta.1",
    installSection: "dependencies",
    capabilities: ["agent-state"],
    phases: ["runtime"],
  },
  {
    package: "@pulumi/pulumi",
    supportedRange: "^3.0.0",
    installSection: "devDependencies",
    capabilities: ["infrastructure"],
    phases: ["deploy"],
  },
] as const;

describe("integration dependency metadata", () => {
  it("optional_peer_roundtrip", () => {
    const json = JSON.stringify(requirements);
    expect(
      Schema.decodeUnknownSync(Schema.fromJsonString(IntegrationDependencyRequirements))(json),
    ).toEqual(requirements);
  });

  it("unused_capability_peer_absent", () => {
    const selected = selectedIntegrationRequirements(requirements, ["cache"], "runtime");
    expect(selected.map((entry) => entry.package)).toEqual(["redis"]);
    expect(selectedIntegrationRequirements(requirements, ["infrastructure"], "runtime")).toEqual(
      [],
    );
  });

  it("duplicate_registration_rejected", () => {
    expect(() =>
      Schema.decodeUnknownSync(IntegrationDependencyRequirements)([
        requirements[0],
        requirements[0],
      ]),
    ).toThrow();
  });
});

describe("integration dependency metadata validation", () => {
  it.each([
    "*",
    "catalog:",
    "workspace:*",
    "",
    "latest",
    "1.0.0-beta.01",
    "^1.2.3 || *",
    ">=banana1",
    "1.x",
    "1.2.X",
    "1.*.3",
    "1.0.0 - 2.x",
    "1.x-beta || 2.0.0",
    "1.x+build || 2.0.0",
  ])("rejects unresolved or unbounded range %s", (supportedRange) => {
    const result = Effect.runSyncExit(
      Schema.decodeUnknownEffect(IntegrationDependencyRequirements)([
        { ...requirements[0], supportedRange },
      ]),
    );
    expect(result._tag).toBe("Failure");
  });

  it("rejects empty capability or phase selection", () => {
    expect(() =>
      Schema.decodeUnknownSync(IntegrationDependencyRequirements)([
        { ...requirements[0], capabilities: [] },
      ]),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(IntegrationDependencyRequirements)([
        { ...requirements[0], phases: [] },
      ]),
    ).toThrow();
  });
});

describe("concrete prerelease dependency ranges", () => {
  it.each(["1.0.0-next.1", "^1.0.0-next.1 <2.0.0", "1.0.0-x", "1.0.0+build.x"])(
    "preserves concrete identifier in %s",
    (supportedRange) => {
      const entries = [{ ...requirements[0], supportedRange }];
      expect(Schema.decodeUnknownSync(IntegrationDependencyRequirements)(entries)).toEqual(entries);
    },
  );
});
