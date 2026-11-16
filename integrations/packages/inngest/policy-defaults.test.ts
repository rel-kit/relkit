import { expect, test } from "bun:test";
import { mapInngestPolicy } from "./src/runtime/policy.js";

test("omitted framework policy fields do not block an Inngest submission", () => {
  expect(
    mapInngestPolicy({
      logging: null,
      maxElapsed: null,
      maxDuration: null,
      retry: {
        maxAttempts: 3,
        initialDelay: "1 second",
        maxDelay: "30 seconds",
        factor: 2,
        jitter: "none",
      },
    }),
  ).toEqual({ retries: 2 });
});

test("a limit Inngest does not enforce is left to the check and start warnings", () => {
  // `relkit check` and the server's start report maxElapsed; a submission is not refused for it.
  expect(mapInngestPolicy({ maxElapsed: "1 hour" })).toEqual({});
});

test("an option Inngest cannot map is refused with the backend and the option named", () => {
  expect(() => mapInngestPolicy({ logging: { level: "info" } })).toThrow(
    'The inngest jobs backend does not support the task option "logging". Remove it from the task.',
  );
});
