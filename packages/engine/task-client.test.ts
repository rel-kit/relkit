import { expect, test } from "bun:test";
import { createTaskDependencyClient } from "./src/task-client.ts";

test("forwards task trigger options without injecting unsupported trace fields", async () => {
  const signal = new AbortController().signal;
  let received: Readonly<Record<string, unknown>> | undefined;
  const client = createTaskDependencyClient(
    "child",
    { trigger: async (_input: unknown, options: Readonly<Record<string, unknown>>) => {
      received = options;
      return "accepted";
    } },
    { ownerId: "parent", signal: () => signal },
    "tasks.parent",
  );

  await expect(client.trigger({ value: 1 }, { idempotencyKey: "business-key", delay: "1 second" })).resolves.toBe("accepted");
  expect(received).toMatchObject({ idempotencyKey: "business-key", delay: "1 second", signal });
  expect(received).not.toHaveProperty("propagation");
});

test("passes task trigger options to the direct task invoker", async () => {
  let received: Readonly<Record<string, unknown>> | undefined;
  const client = createTaskDependencyClient(
    "child",
    undefined,
    {
      ownerId: "parent",
      invokeTask: (request) => {
        received = request.options;
        return "accepted";
      },
    },
    "tasks.parent",
  );

  await expect(client.trigger({ value: 1 }, { operationId: "operation-1" })).resolves.toBe("accepted");
  expect(received).toEqual({ operationId: "operation-1" });
});
