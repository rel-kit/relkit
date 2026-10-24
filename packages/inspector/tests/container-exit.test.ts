/** Only a clean requested interrupt maps to successful container shutdown. */
import { expect, test } from "vitest";
import { Cause, Exit } from "effect";
import { inspectorContainerTeardown } from "../src/container-exit.js";

test("container shutdown keeps failures and defects while accepting interruption-only exit", () => {
  const codes: number[] = [];
  for (const exit of [
    Exit.void,
    Exit.interrupt(1),
    Exit.fail(new Error("primary")),
    Exit.die(new Error("defect")),
    Exit.failCause(Cause.combine(Cause.interrupt(1), Cause.fail(new Error("cleanup")))),
  ])
    inspectorContainerTeardown(exit, (code) => codes.push(code));
  expect(codes).toEqual([0, 0, 1, 1, 1]);
});
