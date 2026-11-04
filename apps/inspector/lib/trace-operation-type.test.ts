import { expect, test } from "bun:test";
import { traceOperationType } from "./trace-operation-type";

test("runtime-handle invocations read as system calls", () => {
  expect(traceOperationType({ name: "relkit.invoke.orders.get", source: "system" })).toBe(
    "system call",
  );
  expect(traceOperationType({ name: "relkit.invoke.orders.get", source: "http" })).toBe(
    "function",
  );
});
