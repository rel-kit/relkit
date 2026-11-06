/** Rebinding the `default` model profile changes the model an agent runs on without agent code changes. */
import { defineAgent } from "relkit/agents";
import { type ResolvedAgentModel } from "relkit/agent-adapters";
import { z } from "relkit/schema";
import { FakeToolCallingModel } from "langchain";
import { expect, test } from "vitest";
import { langchain } from "../src/adapter.js";
import { langchainAgentRuntime } from "../src/adapter-runtime.js";
import { langchainModel } from "../src/model-profile.js";
import {
  createLangchainModelRegistry,
  langchainModelRegistration,
} from "../src/model-profile-runtime.js";
import { runtimeIntegration } from "../src/runtime-integration.js";

const agent = defineAgent({
  id: "profiles.agent",
  runtime: langchain(),
  model: "default",
  input: z.object({ message: z.string() }),
  output: z.object({ answer: z.string() }),
  instructions: "Name your model.",
  tools: [],
  limits: { maxSteps: 2, maxToolCalls: 1, timeoutMs: 5_000 },
});

/** Offline stand-ins for the provider models a profile can be bound to. */
const offline = (id: string) =>
  new FakeToolCallingModel({
    toolCalls: [[{ name: "relkit_output", args: { value: { answer: id } }, id: "out" }]],
  });

async function runWithBinding(binding: ReturnType<typeof langchainModel>) {
  const registry = createLangchainModelRegistry({
    profile: "default",
    connection: binding.connection as Readonly<Record<string, string>>,
  });
  const execution = langchainAgentRuntime.execution({
    agent,
    models: {
      resolve: (selector): ResolvedAgentModel => {
        const bound = registry.resolveModel(selector);
        return { id: bound.id, profile: "default", model: offline(bound.model) };
      },
    },
    tools: { definitions: [], call: () => Promise.reject(new Error("no tools")) },
    state: { load: () => undefined, save: () => undefined },
  });
  return execution.run({ input: { message: "which model?" }, threadId: "t" });
}

test("an agent runs on whichever model the default profile is bound to", async () => {
  await expect(runWithBinding(langchainModel({ model: "openai:gpt-5" }))).resolves.toMatchObject({
    output: { answer: "openai:gpt-5" },
  });
  await expect(
    runWithBinding(langchainModel({ model: "anthropic:claude-sonnet-5-5" })),
  ).resolves.toMatchObject({ output: { answer: "anthropic:claude-sonnet-5-5" } });
});

test("the model profile provider is a runtime registration and validates its model", () => {
  expect(runtimeIntegration.registrations).toContain(langchainModelRegistration);
  const registry = createLangchainModelRegistry({
    profile: "default",
    connection: { model: "openai:gpt-5" },
  });
  expect(registry.resolveModel("default")).toEqual({ id: "openai:gpt-5", model: "openai:gpt-5" });
  expect(registry.resolveModel("default:gpt-5-mini").id).toBe("openai:gpt-5-mini");
  expect(() => langchainModel({ model: "gpt-5" })).toThrow("provider-qualified");
});

test("relkit.config.ts binds model profiles through defineApp", async () => {
  const { defineApp, defineEnv } = await import("relkit/config");
  const app = defineApp({
    env: defineEnv({}),
    model: { default: langchainModel({ model: "openai:gpt-5" }) },
    defaults: { model: "default" },
  });
  expect(JSON.stringify(app)).toContain("langchain-model");
});
