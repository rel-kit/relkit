import { describe, expect, test } from "bun:test";
import {
  RELKIT_DESCRIPTOR,
  assertDescriptor,
  assertRef,
  createDescriptorBase,
  createRef,
  deepFreeze,
  isDescriptor,
  isRef,
} from "../../packages/contracts/src/index.ts";
import { defineJob } from "../../packages/jobs/src/define-job.ts";
import { defineTask } from "../../packages/jobs/src/define-task.ts";
import { defineService, isServiceDescriptor } from "../../packages/services/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";

describe("descriptor contracts", () => {
  test("uses the global brand and normalized immutable refs", () => {
    const descriptor = createDescriptorBase("function", " orders.create ", {
      title: "Create order",
      tags: ["orders", "write"],
    });

    expect(RELKIT_DESCRIPTOR).toBe(Symbol.for("relkit.descriptor"));
    expect(descriptor.id).toBe("orders.create");
    expect(descriptor.ref).toEqual({ kind: "function", id: "orders.create" });
    expect(isDescriptor(descriptor)).toBe(true);
    expect(isRef(descriptor.ref)).toBe(true);
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.ref)).toBe(true);
    expect(Object.isFrozen(descriptor.tags)).toBe(true);
    assertDescriptor(descriptor);
    assertRef(descriptor.ref);
  });

  test("rejects forged or mismatched values and freezes nested cycles", () => {
    const nested: { child?: unknown } = {};
    nested.child = nested;
    const value = deepFreeze({ nested });

    expect(Object.isFrozen(value.nested)).toBe(true);
    expect(isRef({ kind: "function", id: "bad id" })).toBe(false);
    expect(
      isDescriptor({
        [RELKIT_DESCRIPTOR]: true,
        kind: "function",
        id: "orders.create",
        ref: createRef("route", "orders.create"),
      }),
    ).toBe(false);
    expect(() => assertDescriptor({})).toThrow("Invalid RelKit descriptor");
  });

  test("flattens task and job members while retaining descriptor identity", () => {
    const task = defineTask({
      id: "orders.reconcile",
      version: "1",
      input: z.object({ id: z.string() }),
      output: z.object({ ok: z.boolean() }),
      handler: async () => ({ ok: true }),
    });
    const job = defineJob({ name: "reconcile", task });
    const service = defineService({
      id: "orders",
      tasks: { reconcileTask: task },
      jobs: { reconcile: job },
    });

    expect(isServiceDescriptor(service)).toBe(true);
    expect(service.reconcileTask).toBe(task);
    expect(service.reconcile).toBe(job);
    expect(Object.isFrozen(service)).toBe(true);
  });
});
