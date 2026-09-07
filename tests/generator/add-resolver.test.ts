import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  resolveAddRequestDetails,
  resolveCreateOptionsDetails,
  type PromptDriver,
} from "../../packages/create-relkit/src/index.ts";

const templates = resolve(import.meta.dir, "../../templates/default/v1");

test("resolves an interactive add through the same normalized request", async () => {
  const prompt = driver({
    select: { "What would you like to add?": "function", "Choose a service": "hello" },
    text: { "function name": "Send Receipt" },
    confirm: { "Expose this artifact through the service?": true },
  });
  const resolved = await resolveAddRequestDetails(
    ["--project-root", `${templates}/minimal`, "--no-install"],
    { interactive: true, promptDriver: prompt },
  );
  expect(resolved).toMatchObject({
    prompted: true,
    request: {
      kind: "function",
      name: "Send Receipt",
      service: "hello",
      internal: false,
      install: false,
    },
  });
});

test("uses unique services and configured model defaults headlessly", async () => {
  const request = await resolveAddRequestDetails([
    "agent",
    "Assistant",
    "--project-root",
    `${templates}/agent`,
    "--instructions",
    "Answer concisely.",
    "--no-install",
  ]);
  expect(request).toMatchObject({
    prompted: false,
    request: { service: "hello", model: "openai:gpt-5-mini", tools: [] },
  });
});

test("prompts for all omitted create choices and preserves explicit choices", async () => {
  const prompt = driver({
    select: {
      "Starter template": "api",
      "Cloud provider": "aws",
      "Deployment adapter": "pulumi",
    },
    text: { "Project name": "sample-app", Destination: "apps/sample" },
    confirm: {
      "Include examples?": false,
      "Install dependencies?": false,
      "Initialize a Git repository?": false,
    },
  });
  const resolved = await resolveCreateOptionsDetails([], {
    interactive: true,
    promptDriver: prompt,
  });
  expect(resolved).toEqual({
    prompted: true,
    options: {
      name: "sample-app",
      template: "api",
      cloud: "aws",
      deploy: "pulumi",
      install: false,
      git: false,
      examples: false,
      directory: "apps/sample",
      forceEmptyDirectory: false,
      json: false,
    },
  });
});

function driver(answers: {
  readonly select?: Readonly<Record<string, string>>;
  readonly text?: Readonly<Record<string, string>>;
  readonly confirm?: Readonly<Record<string, boolean>>;
}): PromptDriver {
  return {
    text: async (options) => answers.text?.[options.message] ?? options.initialValue ?? "value",
    select: async (options) =>
      (answers.select?.[options.message] ??
        options.initialValue ??
        options.options[0]!.value) as never,
    multiselect: async () => [],
    confirm: async (options) => answers.confirm?.[options.message] ?? options.initialValue ?? true,
    note: () => undefined,
    intro: () => undefined,
    outro: () => undefined,
  };
}
