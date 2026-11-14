/** The invocation span names how an invocation failed without carrying the cause's text. */
import { defineFunction } from "../../src/app/index.js";
import { createObservabilityCollector } from "../../src/observability/index.js";
import { z } from "../../src/schema/index.js";
import { expect, test } from "vitest";
import { invokeFunction } from "../../src/engine/index.js";
import { invocationTarget } from "./fixtures.js";

async function completedSpan(target: unknown) {
  const collector = createObservabilityCollector();
  await invokeFunction(invocationTarget(target), {}, { hooks: { observability: collector } }).catch(
    () => undefined,
  );
  return collector
    .read()
    .find(
      (record): record is Extract<typeof record, { signal: "span" }> =>
        record.signal === "span" &&
        record.name === "relkit.invoke.fleet.register" &&
        record.status === "completed",
    );
}

test("a defect adds an exception event that names only its class", async () => {
  const span = await completedSpan(
    defineFunction({
      id: "fleet.register",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      handler: () => {
        throw new Error("Failed query: select 1\nparams: AB-secret-123");
      },
    }),
  );

  const exception = span?.events?.find((event) => event.name === "exception");
  expect(exception?.attributes).toEqual({ "exception.type": "UnexpectedDefect" });
  expect(JSON.stringify(span)).not.toContain("AB-secret-123");
  expect(JSON.stringify(span)).not.toContain("Failed query");
});
