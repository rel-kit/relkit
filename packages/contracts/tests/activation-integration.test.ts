import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  assertRuntimeIntegrationPlanVersion,
  assertRuntimeIntegrationPlanVersionEffect,
  isRuntimeActivationFingerprint,
  isRuntimeActivationFingerprintEffect,
  RuntimeIntegrationPlanVersionError,
} from "../src/index.js";

const fingerprint = {
  graphHash: "graph-1",
  manifestHash: "manifest-1",
  runtimeIntegrationsPlanHash: "integrations-1",
};

describe("runtime artifact contracts", () => {
  test("accepts required and optional activation hashes through both APIs", () => {
    expect(isRuntimeActivationFingerprint(fingerprint)).toBe(true);
    expect(
      Effect.runSync(
        isRuntimeActivationFingerprintEffect({
          ...fingerprint,
          jobsManifestHash: "jobs-1",
          localServicesPlanHash: "services-1",
          providerOverridesGeneration: "overrides-1",
        }),
      ),
    ).toBe(true);
  });

  test.each([
    null,
    [],
    {},
    { ...fingerprint, graphHash: " " },
    { ...fingerprint, jobsManifestHash: "" },
    { ...fingerprint, localServicesPlanHash: 1 },
    { ...fingerprint, providerOverridesGeneration: " " },
  ])("rejects an invalid activation fingerprint: %j", (candidate) => {
    expect(isRuntimeActivationFingerprint(candidate)).toBe(false);
    expect(Effect.runSync(isRuntimeActivationFingerprintEffect(candidate))).toBe(false);
  });

  test("accepts the supported integration plan version", () => {
    const plan = { version: 1, integrations: [] };
    expect(() => assertRuntimeIntegrationPlanVersion(plan)).not.toThrow();
    expect(Effect.runSync(assertRuntimeIntegrationPlanVersionEffect(plan))).toBe(plan);
  });

  test.each([null, [], {}, { version: 2 }, { version: "1" }])(
    "rejects an unreadable integration plan with a typed error: %j",
    (candidate) => {
      expect(() => assertRuntimeIntegrationPlanVersion(candidate)).toThrow(
        RuntimeIntegrationPlanVersionError,
      );
      const error = Effect.runSync(
        Effect.flip(assertRuntimeIntegrationPlanVersionEffect(candidate)),
      );
      expect(error).toBeInstanceOf(RuntimeIntegrationPlanVersionError);
      expect(error._tag).toBe("RuntimeIntegrationPlanVersionError");
      expect(error.code).toBe("RELKIT_RUNTIME_INTEGRATION_PLAN_VERSION_UNSUPPORTED");
      expect(error.message).toContain("Regenerate with `relkit check`");
    },
  );
});
