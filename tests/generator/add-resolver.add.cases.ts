/** Retains original add assertions for add-resolver, registered by the owning suite. */
import { expect } from "bun:test";
import {
  resolveAddRequestDetails,
  type PromptDriver,
} from "../../packages/cli/src/scaffolding/index.ts";
import { templates, driver } from "./add-resolver.fixture.js";
export async function case1Add() {
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
}

export async function case2Add() {
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
}

export async function case3Add() {
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
}

export async function case4Add() {
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
}
