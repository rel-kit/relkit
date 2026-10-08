import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
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

test("asks only final consent and validates the completed project once", async () => {
  const root = await temporaryRoot();
  const commands: string[][] = [];
  const questions: string[] = [];
  const result = await generateProject(normalizeCreateOptions(["demo", "--install", "--no-git"]), {
    cwd: root,
    templateRoot,
    interactive: true,
    promptDriver: confirmationDriver(questions),
    commandRunner: async (command) => {
      commands.push([...command]);
      return { exitCode: 0 };
    },
    relkitExecutable: "relkit",
  });
  expect(questions).toEqual(["Create this project?"]);
  expect(result.additions).toEqual([]);
  expect(result.files).not.toContain("src/billing/functions/example.function.ts");
  expect(commands.map((command) => command[1])).toEqual(["install", "doctor", "check"]);
  expect(result.nextSteps.commands.install).toBeUndefined();
});

test("retains no-install behavior without offering artifact additions", async () => {
  const root = await temporaryRoot();
  const questions: string[] = [];
  let commands = 0;
  const result = await generateProject(
    normalizeCreateOptions(["demo", "--no-install", "--no-git"]),
    {
      cwd: root,
      templateRoot,
      interactive: true,
      promptDriver: confirmationDriver(questions),
      commandRunner: async () => {
        commands += 1;
        return { exitCode: 0 };
      },
    },
  );
  expect(questions).toEqual(["Create this project?"]);
  expect(commands).toBe(0);
  expect(result.additions).toEqual([]);
  expect(result.warnings).toContainEqual(expect.objectContaining({ code: "validation-skipped" }));
  expect(result.nextSteps.commands).toMatchObject({
    install: "bun install",
    check: "bun run check",
  });
});

test("declined consent creates no stage and preserves cancellation exit 130", async () => {
  const root = await temporaryRoot();
  const questions: string[] = [];
  await expect(
    generateProject(normalizeCreateOptions(["demo", "--no-install", "--no-git"]), {
      cwd: root,
      templateRoot,
      interactive: true,
      promptDriver: confirmationDriver(questions, false),
    }),
  ).rejects.toMatchObject({ code: "RELKIT_CREATE_CANCELLED", exitCode: 130 });
  expect(questions).toEqual(["Create this project?"]);
  expect(await readdir(root)).toEqual([]);
});

test("headless creation never invokes prompt authority", async () => {
  const root = await temporaryRoot();
  const questions: string[] = [];
  await generateProject(normalizeCreateOptions(["demo", "--no-install", "--no-git"]), {
    cwd: root,
    templateRoot,
    promptDriver: confirmationDriver(questions, false),
  });
  expect(questions).toEqual([]);
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-create-consent-"));
  roots.push(root);
  return root;
}

function confirmationDriver(questions: string[], consent = true): PromptDriver {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected setup question.");
  };
  return {
    text: unexpected,
    select: unexpected,
    multiselect: unexpected,
    confirm: async (options) => {
      questions.push(options.message);
      return consent;
    },
    note: () => undefined,
    intro: () => undefined,
    outro: () => undefined,
  };
}
