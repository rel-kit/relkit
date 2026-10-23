/** Retains original creation assertions for add-resolver, registered by the owning suite. */
import { expect } from "bun:test";
import {
  resolveCreateOptionsDetails,
  type PromptDriver,
} from "../../packages/cli/src/scaffolding/index.ts";
import { driver } from "./add-resolver.fixture.js";
export async function case5Creation() {
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
}

export async function case6Creation() {
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
}

export async function case7Creation() {
  const resolved = await resolveCreateOptionsDetails(["sample-app"], {
    interactive: true,
    promptDriver: driver({
      select: { "Starter template": "minimal", "Jobs service": "none" },
      text: { Destination: "apps/sample-api" },
    }),
  });
  expect(resolved).toMatchObject({
    prompted: true,
    options: {
      name: "sample-app",
      template: "minimal",
      directory: "apps/sample-api",
      git: true,
    },
  });
  expect(resolved.options.jobs).toBeUndefined();
}
