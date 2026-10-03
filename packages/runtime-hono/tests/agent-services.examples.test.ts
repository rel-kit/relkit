import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { AgentRunTasks, AgentRunTasksLive } from "../src/agent-run-tasks.js";

// Canonical example linked from AgentRunTasks: start joins the accepted work.
const program = Effect.gen(function* () {
  const tasks = yield* AgentRunTasks;
  let completed = 0;
  yield* tasks.start(
    "example",
    Effect.sync(() => {
      completed++;
    }),
  );
  return completed;
}).pipe(Effect.provide(AgentRunTasksLive));

it.effect("joins accepted work in the documented generation layer", () =>
  Effect.gen(function* () {
    expect(yield* program).toBe(1);
  }),
);
