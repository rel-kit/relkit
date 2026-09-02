import { expect, test } from "bun:test";
import { createRuntimeActivationFingerprint } from "../../packages/compiler/src/index.ts";

const input = {
  graphHash: "sha256:graph",
  manifestSource: "export const manifest = {};\n",
  runtimeIntegrationsPlanSource: '{"version":1}\n',
  localServicesPlanSource: '{"services":[]}\n',
} as const;

test("activation fingerprints bind every selected cohort artifact deterministically", () => {
  const first = createRuntimeActivationFingerprint(input);
  expect(createRuntimeActivationFingerprint(input)).toEqual(first);
  expect(first).toMatchObject({
    graphHash: input.graphHash,
    manifestHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    runtimeIntegrationsPlanHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    localServicesPlanHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
  });
  expect(
    createRuntimeActivationFingerprint({ ...input, manifestSource: `${input.manifestSource} ` })
      .manifestHash,
  ).not.toBe(first.manifestHash);
  expect(
    createRuntimeActivationFingerprint({
      ...input,
      runtimeIntegrationsPlanSource: `${input.runtimeIntegrationsPlanSource} `,
    }).runtimeIntegrationsPlanHash,
  ).not.toBe(first.runtimeIntegrationsPlanHash);
  expect(
    createRuntimeActivationFingerprint({
      ...input,
      localServicesPlanSource: undefined,
      providerOverridesGeneration: "override-1",
    }),
  ).toMatchObject({ providerOverridesGeneration: "override-1" });
});
