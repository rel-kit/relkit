/** Retains original policy assertions for add-resolver, registered by the owning suite. */
import { expect } from "bun:test";
import { resolveCreateOptionsDetails } from "../../packages/cli/src/scaffolding/index.ts";
import { driver } from "./add-resolver.fixture.js";
export async function case8Policy() {
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
}

export async function case9Policy() {
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
}

export async function case10Policy() {
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
}
