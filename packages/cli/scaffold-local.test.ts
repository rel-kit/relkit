import { expect, test } from "bun:test";
import {
  formatScaffoldPlan,
  type AddResult,
  type PromptDriver,
  type ScaffoldPlan,
} from "create-relkit";
import { finishScaffoldLocal } from "./src/scaffold-local.js";
import type { CliCommandContext } from "./src/main-support.js";

const result: AddResult = {
  ok: true,
  command: "add",
  kind: "service",
  projectRoot: "/project with spaces",
  createdFiles: ["src/orders/service.ts"],
  updatedFiles: [],
  installedPackages: [],
  warnings: [
    { code: "docker-required", message: "Run `relkit local up` before using this local resource." },
    { code: "model-key", message: "Populate OPENAI_API_KEY before calling a model." },
  ],
  verification: { status: "passed", command: "bun run check" },
  nextSteps: ["relkit local up", "bun run dev"],
};
const context: CliCommandContext = {
  command: "add",
  args: [],
  json: false,
  tty: true,
  ci: false,
  signal: new AbortController().signal,
  log: () => {},
  reporter: { output: () => {}, error: () => {} },
};
function driver(confirm: PromptDriver["confirm"]): PromptDriver {
  return {
    confirm,
    text: async () => "",
    select: async () => {
      throw new Error("unexpected");
    },
    multiselect: async () => [],
    note: () => {},
    intro: () => {},
    outro: () => {},
  };
}

test("removes descriptor duplication and defers the Docker reminder in the preview", () => {
  const plan = {
    request: { kind: "service" },
    operations: [{ action: "create", path: "src/orders/service.ts" }],
    dependencies: {},
    artifacts: [
      {
        id: "orders.example",
        binding: "example",
        path: "src/orders/functions/example.function.ts",
      },
    ],
    profiles: [],
    warnings: result.warnings,
  } as unknown as ScaffoldPlan;
  const text = formatScaffoldPlan(plan);
  expect(text).not.toContain("Descriptors");
  expect(text).not.toContain("orders.example");
  expect(text).not.toContain("relkit local up");
  expect(text).toContain("src/orders/service.ts");
  expect(text).toContain("OPENAI_API_KEY");
});

test.each([true, false])(
  "offers detached local startup after success, approval=%s",
  async (approved) => {
    const calls: string[][] = [];
    const completed = await finishScaffoldLocal(
      result,
      context,
      driver(async ({ message }) => {
        expect(message).toContain("relkit local up --detach");
        return approved;
      }),
      async (args) => {
        calls.push([...args]);
        return 0;
      },
    );
    expect(calls).toEqual(
      approved ? [["up", "--detach", "--project-root", result.projectRoot]] : [],
    );
    expect(completed.exitCode).toBe(0);
    expect(completed.result.warnings.some((warning) => warning.code === "docker-required")).toBe(
      !approved,
    );
    expect(completed.result.nextSteps.includes("relkit local up")).toBe(!approved);
    expect(completed.result.warnings.some((warning) => warning.code === "model-key")).toBe(true);
  },
);

test("keeps saved files and a retry reminder when local startup fails", async () => {
  const completed = await finishScaffoldLocal(
    result,
    context,
    driver(async () => true),
    async () => 1,
  );
  expect(completed.exitCode).toBe(1);
  expect(completed.result.createdFiles).toEqual(result.createdFiles);
  expect(completed.result.warnings.at(-1)?.code).toBe("local-start-failed");
});

test("never starts Docker in headless, JSON, CI or unverified runs", async () => {
  const unexpected = async (): Promise<never> => {
    throw new Error("Must not prompt or start");
  };
  for (const next of [
    { ...context, tty: false },
    { ...context, json: true },
    { ...context, ci: true },
  ])
    expect(await finishScaffoldLocal(result, next, driver(unexpected), unexpected)).toEqual({
      result,
      exitCode: 0,
    });
  const skipped: AddResult = {
    ...result,
    verification: { status: "skipped", command: "bun run check", reason: "Packages missing" },
  };
  expect((await finishScaffoldLocal(skipped, context, driver(unexpected), unexpected)).result).toBe(
    skipped,
  );
});

test("cancelling the post-scaffold prompt does not claim the scaffold was rolled back", async () => {
  const completed = await finishScaffoldLocal(
    result,
    context,
    driver(async () => {
      throw Object.assign(new Error("Cancelled"), { code: "RELKIT_ADD_CANCELLED" });
    }),
    async () => {
      throw new Error("Must not start");
    },
  );
  expect(completed).toEqual({ result, exitCode: 0 });
});
