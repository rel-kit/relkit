import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  generateProject,
  normalizeCreateOptions,
  type PromptDriver,
} from "../../packages/create-relkit/src/index.ts";

const roots: string[] = [];
const templateRoot = resolve(import.meta.dir, "../../templates/default/v1");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("offers staged additions and validates the completed project once", async () => {
  const root = await temporaryRoot();
  const commands: readonly string[][] = [];
  const result = await generateProject(normalizeCreateOptions(["demo", "--install", "--no-git"]), {
    cwd: root,
    templateRoot,
    interactive: true,
    promptDriver: additionDriver("simple"),
    commandRunner: async (command) => {
      (commands as string[][]).push([...command]);
      return { exitCode: 0 };
    },
    relkitExecutable: "relkit",
  });

  expect(result.additions).toHaveLength(1);
  expect(result.additions[0]).toMatchObject({
    kind: "service",
    verification: { status: "skipped" },
  });
  expect(result.files).toContain("src/billing/functions/example.function.ts");
  expect(commands.map((command) => command[1])).toEqual(["install", "doctor", "check"]);
  expect(result.nextSteps.commands.install).toBeUndefined();
});

test("defers validation when a no-install staged addition needs packages", async () => {
  const root = await temporaryRoot();
  let commands = 0;
  const result = await generateProject(
    normalizeCreateOptions(["demo", "--no-install", "--no-git"]),
    {
      cwd: root,
      templateRoot,
      interactive: true,
      promptDriver: additionDriver("full"),
      commandRunner: async () => {
        commands += 1;
        return { exitCode: 0 };
      },
    },
  );

  expect(commands).toBe(0);
  expect(result.warnings).toContainEqual(expect.objectContaining({ code: "validation-skipped" }));
  expect(result.nextSteps.commands).toMatchObject({
    install: "bun install",
    check: "bun run check",
  });
});

test("cleans the staged project and preserves cancellation exit 130", async () => {
  const root = await temporaryRoot();
  const destination = join(root, "demo");
  const prompt = additionDriver("simple");
  await expect(
    generateProject(normalizeCreateOptions(["demo", "--no-install", "--no-git"]), {
      cwd: root,
      templateRoot,
      interactive: true,
      promptDriver: {
        ...prompt,
        confirm: async (options) => {
          if (options.message === "Add an artifact before finishing?") {
            throw Object.assign(new Error("Scaffolding was cancelled."), {
              code: "RELKIT_CREATE_CANCELLED",
              exitCode: 130,
            });
          }
          return prompt.confirm(options);
        },
      },
    }),
  ).rejects.toMatchObject({ code: "RELKIT_CREATE_CANCELLED", exitCode: 130 });
  expect(await Bun.file(destination).exists()).toBeFalse();
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-create-additions-"));
  roots.push(root);
  return root;
}

function additionDriver(mode: "simple" | "full"): PromptDriver {
  let addQuestions = 0;
  return {
    text: async (options) =>
      options.message === "service name" ? "Billing" : (options.initialValue ?? "value"),
    select: async (options) => {
      if (options.message === "What would you like to add?") return "service" as never;
      if (options.message === "Service contents") return mode as never;
      return (options.initialValue ?? options.options[0]!.value) as never;
    },
    multiselect: async () => [],
    confirm: async (options) => {
      if (options.message.includes("Add an artifact") || options.message.includes("Add another")) {
        addQuestions += 1;
        return addQuestions === 1;
      }
      return true;
    },
    note: () => undefined,
    intro: () => undefined,
    outro: () => undefined,
  };
}
