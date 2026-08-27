import { describe, expect, test } from "bun:test";
import { z } from "@relkit/schema";
import {
  createJobClient,
  JobInputValidationError,
  JobOperationCancelledError,
  type JobOperationContext,
  type JobProvider,
} from "./src/client.ts";

describe("job Promise client", () => {
  test("validates input, resolves a logical profile, and correlates bridge/hooks", async () => {
    const bridgeNames: string[] = [];
    const declared: unknown[] = [];
    const observed: unknown[] = [];
    let context!: JobOperationContext;
    const provider: JobProvider = {
      enqueue: async (input, options, current) => {
        context = current;
        expect(input).toEqual({ id: "order-1" });
        expect(options).toEqual({ correlationId: "request-1" });
        return { instanceId: "job-1", accepted: true };
      },
    };
    const client = createJobClient({
      ownerId: "orders.create",
      jobId: "orders.send",
      inputSchema: z.object({ id: z.string() }),
      profile: "archive",
      source: { archive: provider },
      correlationId: () => "request-1",
      bridge: {
        run: async (operation, options) => {
          bridgeNames.push(options?.name ?? "");
          return operation();
        },
      },
      onDeclaredEdge: (edge) => declared.push(edge),
      onObservedEdge: (edge) => observed.push(edge),
    });

    await expect(client.enqueue({ id: "order-1" })).resolves.toEqual({
      instanceId: "job-1",
      accepted: true,
      status: "accepted",
      profile: "archive",
      correlationId: "request-1",
    });
    expect(bridgeNames).toEqual(["relkit.job.orders.send.enqueue"]);
    expect(declared).toEqual([{ kind: "enqueues-job", from: "orders.create", to: "orders.send" }]);
    expect(observed).toEqual([
      { relationship: "enqueues-job", from: "orders.create", to: "orders.send" },
    ]);
    expect(context).toMatchObject({
      operation: "enqueue",
      profile: "archive",
      correlationId: "request-1",
    });
    expect(context.signal).toBeInstanceOf(AbortSignal);
  });

  test("rejects invalid input before provider work and propagates cancellation", async () => {
    let calls = 0;
    const controller = new AbortController();
    let started!: () => void;
    const provider: JobProvider = {
      enqueue: async (_input, _options, context) => {
        calls += 1;
        started();
        await new Promise<void>(() => undefined);
        return { instanceId: "never", accepted: true };
      },
    };
    const client = createJobClient({
      ownerId: "orders.create",
      jobId: "orders.send",
      inputSchema: z.object({ id: z.string() }),
      source: provider,
      signal: () => controller.signal,
    });

    await expect(client.enqueue({ id: 1 } as never)).rejects.toBeInstanceOf(
      JobInputValidationError,
    );
    const begun = new Promise<void>((resolve) => {
      started = resolve;
    });
    const execution = client.enqueue({ id: "order-1" });
    await begun;
    controller.abort();
    await expect(execution).rejects.toBeInstanceOf(JobOperationCancelledError);
    expect(calls).toBe(1);
  });
});
