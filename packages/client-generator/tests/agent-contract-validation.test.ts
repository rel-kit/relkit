import { Effect } from "effect";
import { expect, test } from "vitest";
import {
  generateClientRegistryFromDocumentEffect,
  InvalidClientContract,
} from "../src/generate-registry.js";
test("rejects malformed remote agent metadata through the typed failure channel", () => {
  const base = { tools: [], state: [], events: [], scopes: [], waiting: [] };
  const invalid = [
    { contract: { ...base, tools: { broken: true } }, path: ".tools" },
    { contract: { ...base, tools: [{ kind: "other" }] }, path: ".tools[0].kind" },
    { contract: { ...base, tools: [{ id: "broken" }] }, path: ".tools[0]" },
    { contract: { ...base, state: [null] }, path: ".state[0]" },
    { contract: { ...base, state: [{ name: "broken", optional: false }] }, path: ".state[0]" },
    {
      contract: { ...base, state: [{ name: "broken", schema: {}, optional: false }] },
      path: ".state[0]",
    },
    { contract: { ...base, events: [{ kind: "other" }] }, path: ".events[0].kind" },
    { contract: { ...base, events: [{ name: "broken" }] }, path: ".events[0]" },
    { contract: { ...base, scopes: [{ kind: "other" }] }, path: ".scopes[0].kind" },
    { contract: { ...base, scopes: [{ kind: { toString: null } }] }, path: ".scopes[0].kind" },
    { contract: { ...base, scopes: [{ kind: "node" }] }, path: ".scopes[0].id" },
    {
      contract: { ...base, waiting: [{ scope: { kind: "dynamic" } }] },
      path: ".waiting[0].response",
    },
  ];
  for (const { contract, path } of invalid) {
    const document = { agents: [{ id: "assistant", clientContract: contract }] };
    const failure = Effect.runSync(Effect.flip(generateClientRegistryFromDocumentEffect(document)));
    expect(failure).toBeInstanceOf(InvalidClientContract);
    expect((failure as InvalidClientContract).path).toContain(path);
  }
  const dynamic = generateClientRegistryFromDocumentEffect({
    agents: [
      {
        id: "assistant",
        clientContract: {
          ...base,
          tools: [{ kind: "dynamic" }],
          events: [{ kind: "dynamic" }],
        },
      },
    ],
  });
  expect(Effect.runSync(dynamic)).toContain("ClientAgentDynamic");
});
