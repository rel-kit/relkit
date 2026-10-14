/** Exercises the packed generator's real option resolver while borrowing its native prompt-driver contract. */
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { PromptDriver } from "create-relkit";
import { Effect } from "effect";
import { scaffoldNative } from "./scaffold-native.js";

/**
 * Builds a deterministic native prompt driver for the actual packed resolver.
 * @param requested - Invocation-owned record of questions asked by the SDK.
 * @returns The native driver; unexpected prompts fail acceptance.
 */
function resolverPrompts(requested: string[]): PromptDriver {
  return {
    text: async ({ message }) => {
      requested.push(message);
      if (message === "Project name") return "interactive-app";
      assert.equal(message, "Destination");
      return "interactive-project";
    },
    select: async ({ message, options }) => {
      requested.push(message);
      assert.ok(message === "Starter template" || message === "Jobs service");
      const selected = options.find(
        (option) => option.value === (message === "Starter template" ? "minimal" : "none"),
      );
      assert.ok(selected);
      return selected.value;
    },
    multiselect: async () => {
      throw new Error("Creation requested an unexpected multiselect.");
    },
    confirm: async () => {
      throw new Error("Confirmation belongs to generation, after option resolution.");
    },
    note: () => undefined,
    intro: () => undefined,
    outro: () => undefined,
  };
}

/**
 * Checks default creation questions and explicit certified option parsing.
 * @param root - Registry consumer containing the verified packed generator.
 * @returns Completion after the real installed resolver has exercised both prompt paths.
 * @remarks Uncertified public creation tuples are exercised by the separate native rejection matrix.
 */
export const interactiveResolver = Effect.fn("ScaffoldResolver.verify")(function* (root: string) {
  // The outer registry validates this exact package identity before installation.
  // This single projection is the foreign module ABI, not application data.
  const api = (yield* scaffoldNative(
    "resolver.import",
    () => import(pathToFileURL(join(root, "node_modules/create-relkit/dist/index.js")).href),
  )) as typeof import("create-relkit");
  const requested: string[] = [];
  const answers = resolverPrompts(requested);
  const resolved = yield* scaffoldNative("resolver.defaults", () =>
    api.resolveCreateOptionsDetails([], {
      interactive: true,
      promptDriver: answers,
    }),
  );
  assert.equal(resolved.options.name, "interactive-app");
  assert.equal(resolved.options.template, "minimal");
  assert.equal(resolved.options.directory, "interactive-project");
  assert.equal(resolved.options.cloud, "none");
  assert.equal(resolved.options.deploy, "none");
  assert.equal(resolved.options.jobs, undefined);
  assert.equal(resolved.options.install, true);
  assert.equal(resolved.options.git, true);
  assert.equal(resolved.options.examples, true);
  assert.deepEqual(requested, ["Project name", "Starter template", "Jobs service", "Destination"]);
  requested.length = 0;
  const explicit = yield* scaffoldNative("resolver.explicit", () =>
    api.resolveCreateOptionsDetails(
      ["named-app", "--template", "minimal", "--directory", "explicit-project", "--no-install"],
      { interactive: true, promptDriver: answers },
    ),
  );
  assert.equal(explicit.options.name, "named-app");
  assert.equal(explicit.options.template, "minimal");
  assert.equal(explicit.options.jobs, undefined);
  assert.equal(explicit.options.directory, "explicit-project");
  assert.equal(explicit.options.install, false);
  assert.deepEqual(requested, ["Jobs service"]);
});
