import { expect, test } from "bun:test";
import * as localService from "./src/index.ts";

test("keeps the local-service protocol entrypoint side-effect free", () => {
  expect(localService).toMatchObject({
    LOCAL_SERVICE_PLAN_FILE: "local-services.plan.json",
    LOCAL_SERVICE_PLAN_VERSION: 1,
    LOCAL_SERVICE_PROTOCOL_VERSION: 1,
    LOCAL_SERVICE_STATE_FILE: "local-services.state.json",
    LOCAL_SERVICE_STATE_VERSION: 1,
    PROVIDER_OVERRIDE_STATE_FILE: "provider-overrides.json",
    PROVIDER_OVERRIDE_STATE_VERSION: 1,
  });
});

test("rejects every stale local-service artifact version with regeneration guidance", () => {
  for (const [assertVersion, code] of [
    [localService.assertLocalServicePlanVersion, "RELKIT_LOCAL_SERVICE_PLAN_VERSION_UNSUPPORTED"],
    [localService.assertLocalServiceStateVersion, "RELKIT_LOCAL_SERVICE_STATE_VERSION_UNSUPPORTED"],
    [
      localService.assertProviderOverrideStateVersion,
      "RELKIT_PROVIDER_OVERRIDE_STATE_VERSION_UNSUPPORTED",
    ],
  ] as const) {
    expect(() => assertVersion({ version: 0 })).toThrow(
      expect.objectContaining({ code, message: expect.stringContaining("Regenerate with") }),
    );
  }
});

test("validates and scopes provider overrides to the expected activation", () => {
  const hash = `sha256:${"a".repeat(64)}`;
  const value = {
    version: 1,
    applicationId: "example",
    localProjectId: hash,
    planHash: hash,
    generationId: "generation-1",
    bindings: [{ bindingId: "provider.cache.default", values: { url: "redis://local" } }],
  };
  expect(
    localService.providerOverrideBindingValues(value, {
      applicationId: "example",
      planHash: hash,
      generationId: "generation-1",
    }),
  ).toEqual({ "provider.cache.default": { url: "redis://local" } });
  expect(() =>
    localService.providerOverrideBindingValues(value, {
      applicationId: "example",
      planHash: hash,
      generationId: "generation-2",
    }),
  ).toThrow("does not match the runtime activation");
});
