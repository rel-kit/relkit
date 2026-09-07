import { expect, test } from "bun:test";
import { parseEffectCli } from "./src/cli-effect-runtime.js";
import { CLI_EXIT_CODES, runCli, type CliIo } from "./src/main.js";
import { resolveRootMenu } from "./src/root-menu.js";
import type { PromptDriver } from "create-relkit";

test("parses every add value through the Effect command tree", async () => {
  expect(
    (
      await parseEffectCli(
        [
          "add",
          "agent",
          "Support",
          "--service",
          "orders",
          "--model",
          "openai:gpt-5-mini",
          "--tool",
          "lookup",
          "--tool",
          "refund",
          "--instructions",
          "Help customers.",
        ],
        "test",
      )
    ).invocation,
  ).toEqual({
    command: "add",
    args: [
      "agent",
      "Support",
      "--service",
      "orders",
      "--model",
      "openai:gpt-5-mini",
      "--tool",
      "lookup",
      "--tool",
      "refund",
      "--instructions",
      "Help customers.",
    ],
  });
});

test("keeps add JSON isolated to one result object", async () => {
  const captured = output();
  const api = scaffoldApi(false);
  expect(
    await runCli(["--json", "add", "function", "Hello"], {
      io: captured.io,
      installSignalHandlers: false,
      loadCreateRelkit: async () => api,
    }),
  ).toBe(CLI_EXIT_CODES.success);
  expect(captured.stderr).toEqual([]);
  expect(captured.stdout).toHaveLength(1);
  expect(JSON.parse(captured.stdout[0]!)).toMatchObject({
    ok: true,
    command: "add",
    kind: "function",
  });
});

test("shows and confirms an interactively resolved add plan", async () => {
  const captured = output();
  const notes: string[] = [];
  const confirmations: string[] = [];
  const prompt: PromptDriver = {
    text: async () => "value",
    select: async (options) => options.options[0]!.value as never,
    multiselect: async () => [],
    confirm: async (options) => {
      confirmations.push(options.message);
      return true;
    },
    note: (message) => notes.push(message),
    intro: () => undefined,
    outro: () => undefined,
  };
  expect(
    await runCli(["add", "function"], {
      io: captured.io,
      tty: true,
      ci: false,
      promptDriver: prompt,
      installSignalHandlers: false,
      loadCreateRelkit: async () => scaffoldApi(true),
    }),
  ).toBe(CLI_EXIT_CODES.success);
  expect(notes[0]).toContain("Function scaffold");
  expect(confirmations).toEqual(["Apply these changes?"]);
  expect(captured.stdout[0]).toContain("Added function.");
});

test("opens the context menu only for an empty TTY invocation", async () => {
  const captured = output();
  const prompt = {
    ...quietPrompt,
    select: async () => "help" as never,
  } satisfies PromptDriver;
  expect(
    await runCli([], {
      io: captured.io,
      tty: true,
      ci: false,
      promptDriver: prompt,
      installSignalHandlers: false,
    }),
  ).toBe(CLI_EXIT_CODES.success);
  expect(captured.stdout[0]).toContain("USAGE");
});

test("maps the project local-services action to a useful status command", async () => {
  expect(
    await resolveRootMenu([], {
      enabled: true,
      cwd: new URL("../../templates/default/v1/minimal", import.meta.url).pathname,
      promptDriver: { ...quietPrompt, select: async () => "local" as never },
    }),
  ).toEqual(["local", "status"]);
});

function scaffoldApi(prompted: boolean) {
  const request = {
    kind: "function" as const,
    name: "Hello",
    projectRoot: "/project",
    install: true,
    internal: false,
  };
  const plan = {
    request,
    projectRoot: "/project",
    operations: [{ path: "src/hello.ts", action: "create" as const, content: "export {};\n" }],
    dependencies: {},
    artifacts: [{ kind: "function", path: "src/hello.ts", id: "hello", binding: "hello" }],
    profiles: [],
    warnings: [],
    nextSteps: [],
  };
  return {
    normalizeCreateOptions: () => ({}),
    generateProject: async () => undefined,
    resolveAddRequestDetails: async () => ({ request, prompted }),
    planAdd: async () => plan,
    applyScaffoldPlan: async () => ({
      ok: true as const,
      command: "add" as const,
      kind: "function" as const,
      projectRoot: "/project",
      createdFiles: ["src/hello.ts"],
      updatedFiles: [],
      installedPackages: [],
      warnings: [],
      verification: { status: "passed" as const, command: "bun run check" },
      nextSteps: [],
    }),
  };
}

const quietPrompt: PromptDriver = {
  text: async () => "value",
  select: async (options) => options.options[0]!.value as never,
  multiselect: async () => [],
  confirm: async () => true,
  note: () => undefined,
  intro: () => undefined,
  outro: () => undefined,
};

function output(): { readonly io: CliIo; readonly stdout: string[]; readonly stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
  };
}
