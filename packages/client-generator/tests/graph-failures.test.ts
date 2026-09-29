import { expect, test } from "vitest";
import { Effect } from "effect";
import { graph } from "./fixtures/generator-graphs.js";
import {
  generateClientContractDocumentEffect,
  generateContract,
  generateContractEffect,
} from "../src/generate-contract.js";
import { publicManifestEffect } from "../src/generate-public-manifest.js";
import {
  generateClientManifestEffect,
  generateClientRegistryEffect,
  publicFingerprintEffect,
} from "../src/generate-registry.js";
import { clientRoutesEffect, MissingRouteTarget } from "../src/generate-types.js";
test("graph generators preserve missing routes in the typed Effect channel", () => {
  const base = graph(false);
  const broken = { ...base, nodes: base.nodes.filter((node) => node.kind !== "function") };
  const operations = [
    generateContractEffect(broken),
    generateClientContractDocumentEffect(broken, "sha256:test"),
    publicManifestEffect(broken),
    publicFingerprintEffect(broken),
    generateClientManifestEffect(broken),
    generateClientRegistryEffect(broken),
  ];
  for (const operation of operations) {
    const failure = Effect.runSync(Effect.flip(operation));
    expect(failure).toBeInstanceOf(MissingRouteTarget);
    expect(failure.triggerId).toBe("orders.get");
  }
  expect(() => generateContract(broken)).toThrowError(TypeError);
});
test("graph adapter propagates unrelated defects unchanged", () => {
  const sentinel = new Error("graph read failed");
  const defective = {
    ...graph(false),
    get nodes() {
      throw sentinel;
    },
  };
  expect(() => generateContract(defective)).toThrow(sentinel);
});

test("disabled HTTP triggers do not enter the public route set", () => {
  const base = graph(false);
  const disabled = {
    ...base,
    nodes: base.nodes.map((node) =>
      node.kind === "trigger"
        ? { ...node, config: { ...node.config, client: false as const } }
        : node,
    ),
  };
  expect(Effect.runSync(clientRoutesEffect(disabled))).toEqual([]);
});
