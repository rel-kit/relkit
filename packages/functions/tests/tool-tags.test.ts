import { expect, test } from "vitest";
import { SchemaValidatorLive, z } from "@relkit/schema";
import { Effect } from "effect";
import { defineFunction } from "../src/define-function.js";
import { invokeFunctionToolEffect } from "../src/function-tool-runtime.js";
const target = defineFunction({
  id: "orders.lookup",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: ({ id }) => ({ id }),
});
test("tool argument and approval failures recover by their Effect tags", async () => {
  let issueMessage: string | undefined;
  const invalid = await Effect.runPromise(
    Effect.provide(
      invokeFunctionToolEffect(
        target,
        { id: "orders.tool", sideEffect: "read", approval: "never" },
        { id: 1 } as never,
      ).pipe(
        Effect.catchTag("FunctionToolArgumentFailure", (failure) => {
          issueMessage = failure.issues[0]?.message;
          return Effect.succeed("invalid");
        }),
      ),
      SchemaValidatorLive,
    ),
  );
  expect(invalid).toBe("invalid");
  expect(issueMessage).toBeDefined();
  let requiredToolId: string | undefined;
  const required = await Effect.runPromise(
    Effect.provide(
      invokeFunctionToolEffect(
        target,
        { id: "orders.tool", sideEffect: "read", approval: "always" },
        { id: "one" },
      ).pipe(
        Effect.catchTag("FunctionToolApprovalRequiredFailure", (failure) => {
          requiredToolId = failure.approval.toolId;
          return Effect.succeed("required");
        }),
      ),
      SchemaValidatorLive,
    ),
  );
  expect(required).toBe("required");
  expect(requiredToolId).toBe("orders.tool");
  const denied = await Effect.runPromise(
    Effect.provide(
      invokeFunctionToolEffect(
        target,
        { id: "orders.tool", sideEffect: "read", approval: "always" },
        { id: "one" },
        { approval: () => false },
      ).pipe(Effect.catchTag("FunctionToolApprovalDeniedFailure", () => Effect.succeed("denied"))),
      SchemaValidatorLive,
    ),
  );
  expect(denied).toBe("denied");
  const controller = new AbortController();
  controller.abort();
  const cancelled = await Effect.runPromise(
    Effect.provide(
      invokeFunctionToolEffect(
        target,
        { id: "orders.tool", sideEffect: "read", approval: "never" },
        { id: "one" },
        { signal: controller.signal },
      ).pipe(Effect.catchTag("FunctionToolCancelledFailure", () => Effect.succeed("cancelled"))),
      SchemaValidatorLive,
    ),
  );
  expect(cancelled).toBe("cancelled");
});
