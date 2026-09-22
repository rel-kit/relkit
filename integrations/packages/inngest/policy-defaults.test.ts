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
  expect(() => mapInngestPolicy({ maxElapsed: "1 hour" })).toThrow(
    'Inngest cannot certify task policy field "maxElapsed".',
  );
});
