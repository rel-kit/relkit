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

test("uses unique services and explicit model selectors headlessly", async () => {
  const request = await resolveAddRequestDetails([
    "agent",
    "Assistant",
    "--project-root",
    `${templates}/agent`,
    "--model",
    "test:offline",
    "--instructions",
    "Answer concisely.",
    "--no-install",
  ]);
  expect(request).toMatchObject({
    prompted: false,
    request: { service: "hello", model: "test:offline", tools: [] },
  });
});

test("offers existing functions and function creation when adding a tool", async () => {
  for (const create of [false, true]) {
    const prompt: PromptDriver = {
      ...driver({ text: { "Callable function name to create": "Find Order" } }),
      select: async (options) => {
        if (options.message === "Callable function target") {
          expect(options.options).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ value: "hello.greet" }),
              expect.objectContaining({
                value: "__create_function__",
                label: "Create a new function",
              }),
            ]),
          );
          return (create ? "__create_function__" : "hello.greet") as never;
        }
        return (options.initialValue ?? options.options[0]!.value) as never;
      },
    };
    const { request } = await resolveAddRequestDetails(
      ["tool", "Lookup", "--service", "hello", "--project-root", `${templates}/minimal`],
      { interactive: true, promptDriver: prompt },
    );
    expect(request).toMatchObject({ target: create ? "Find Order" : "hello.greet" });
    if (create) expect(request).toHaveProperty("createFunction", true);
    else expect(request).not.toHaveProperty("createFunction");
  }
});

test("creates a function for a new service and respects explicit creation headlessly", async () => {
  const { request } = await resolveAddRequestDetails(
    ["tool", "Lookup", "--create-service", "Orders", "--project-root", `${templates}/minimal`],
    { interactive: true, promptDriver: driver({}) },
  );
  expect(request).toMatchObject({ target: "Lookup", createFunction: true });
  expect(
    await resolveAddRequestDetails([
      "tool",
      "Lookup",
      "--create-function",
      "Find Order",
      "--project-root",
      `${templates}/minimal`,
    ]),
  ).toMatchObject({
    prompted: false,
    request: { service: "hello", target: "Find Order", createFunction: true },
  });
});

test("asks for name, template, jobs and destination while keeping silent defaults", async () => {
  const questions: string[] = [];
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected setup question.");
  };
  const prompt: PromptDriver = {
    ...driver({}),
    select: async (options) => {
      questions.push(options.message);
      if (options.initialValue === undefined) throw new Error("Missing initial selection.");
      return options.initialValue;
    },
    multiselect: unexpected,
    confirm: unexpected,
    text: async (options) => {
      questions.push(options.message);
      if (options.message === "Destination") {
        expect(options.initialValue).toBe("sample-app");
        expect(options.validate?.("")).toBe("A destination is required.");
        expect(options.validate?.("sample-app")).toBeUndefined();
      }
      return "sample-app";
    },
  };
  const resolved = await resolveCreateOptionsDetails([], {
    interactive: true,
    promptDriver: prompt,
  });
  expect(questions).toEqual(["Project name", "Starter template", "Jobs service", "Destination"]);
  expect(resolved).toEqual({
    prompted: true,
    options: {
      name: "sample-app",
      template: "minimal",
      cloud: "none",
      deploy: "none",
      install: true,
      git: true,
      examples: true,
      directory: "sample-app",
      forceEmptyDirectory: false,
      json: false,
    },
  });
});

test("rejects unsupported explicit creation flags without any setup question", async () => {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected setup question.");
  };
  const prompt: PromptDriver = {
    ...driver({}),
    text: unexpected,
    select: unexpected,
    multiselect: unexpected,
    confirm: unexpected,
  };
  await expect(
    resolveCreateOptionsDetails(
      [
        "sample-app",
        "--template",
        "api",
        "--cloud",
        "aws",
        "--deploy",
        "pulumi",
        "--jobs",
        "effect-mq-docker",
        "--directory",
        "apps/sample",
        "--no-install",
        "--no-git",
        "--no-examples",
      ],
      { interactive: true, promptDriver: prompt },
    ),
  ).rejects.toThrow("not certified");
});

test("offers the certified starter template and honors a custom destination", async () => {
  const resolved = await resolveCreateOptionsDetails(["sample-app"], {
    interactive: true,
    promptDriver: driver({
      select: { "Starter template": "minimal", "Jobs service": "none" },
      text: { Destination: "apps/sample-api" },
    }),
  });
  expect(resolved).toMatchObject({
    prompted: true,
    options: { name: "sample-app", template: "minimal", directory: "apps/sample-api", git: true },
  });
  expect(resolved.options.jobs).toBeUndefined();
});

test("rejects an uncertified inline template after filtering jobs", async () => {
  const questions: string[] = [];
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected setup question.");
  };
  await expect(
    resolveCreateOptionsDetails(
      ["sample-app", "--template=agent", "--directory=apps/sample", "--no-git"],
      {
        interactive: true,
        promptDriver: {
          ...driver({}),
          text: unexpected,
          confirm: unexpected,
          select: async (options) => {
            questions.push(options.message);
            const selected = options.options.find((option) => option.value === "none");
            if (!selected) throw new Error("Missing jobs default.");
            return selected.value;
          },
        },
      },
    ),
  ).rejects.toThrow("not certified");
  expect(questions).toEqual(["Jobs service"]);
});

test("hides uncertified jobs providers interactively", async () => {
  const resolved = await resolveCreateOptionsDetails(
    ["sample-app", "--template=minimal", "--directory=sample-app"],
    {
      interactive: true,
      promptDriver: {
        ...driver({}),
        select: async (options) => {
          expect(options.message).toBe("Jobs service");
          expect(options.options).toEqual([{ value: "none", label: "None" }]);
          return "none" as never;
        },
      },
    },
  );
  expect(resolved.options.jobs).toBeUndefined();
});

test("retains headless defaults without requesting interactive choices", async () => {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected headless prompt.");
  };
  const resolved = await resolveCreateOptionsDetails(["sample-app"], {
    json: true,
    promptDriver: {
      ...driver({}),
      text: unexpected,
      select: unexpected,
      multiselect: unexpected,
      confirm: unexpected,
    },
  });
  expect(resolved).toMatchObject({
    prompted: false,
    options: { template: "minimal", cloud: "none", deploy: "none", git: true, json: true },
  });
  expect(resolved.options.jobs).toBeUndefined();
  expect(resolved.options.directory).toBeUndefined();
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
