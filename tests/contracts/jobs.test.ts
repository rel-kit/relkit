import { createScheduler } from "../../packages/providers-local/src/index.ts";
import { createTestJob } from "../../packages/testing/src/index.ts";
import type { InvocationContext } from "../../packages/engine/src/index.ts";
import { registerJobContractSuite, type JobContractTarget } from "./jobs.ts";
import { z } from "../../packages/schema/src/index.ts";

const input = z.object({ orderId: z.string() });
const output = z.object({ processed: z.boolean() });

const testingJobs: JobContractTarget = {
  name: "deterministic testing job harness",
  capabilities: {
    durable: true,
    atLeastOnce: true,
    idempotency: true,
    schedules: true,
    concurrency: true,
    restartRecovery: true,
    quarantine: true,
    cancellation: true,
    exactlyOnce: false,
  },
  create: async (options = {}) => {
    const invocations: Array<{
      readonly input: { readonly orderId: string };
      readonly source: InvocationContext["invocation"]["source"];
      readonly attempt: number;
    }> = [];
    const target = {
      id: "contracts.jobs.target",
      input,
      output,
      ...(options.functionConcurrency === undefined
        ? {}
        : { concurrency: options.functionConcurrency }),
      handler: async (
        currentInput: { readonly orderId: string },
        _request,
        context: InvocationContext,
      ) => {
        invocations.push({
          input: currentInput,
          source: context.invocation.source,
          attempt: context.invocation.attempt,
        });
        return options.handler?.(currentInput, context) ?? { processed: true };
      },
    };
    const job = await createTestJob({
      jobId: "contracts.jobs",
      target,
      ...(options.retry === undefined ? {} : { retry: options.retry }),
      ...(options.idempotency === undefined ? {} : { idempotency: options.idempotency }),
      ...(options.leaseDurationMs === undefined
        ? {}
        : { leaseDurationMs: options.leaseDurationMs }),
      ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
      ...(options.consumerConcurrency === undefined
        ? {}
        : { consumerConcurrency: options.consumerConcurrency }),
      ...(options.startTimeMs === undefined ? {} : { startTimeMs: options.startTimeMs }),
    });
    return {
      job,
      invocations,
      createScheduler: (now) => createScheduler({ now }),
    };
  },
};

registerJobContractSuite(testingJobs);
