import type { TaskExecutionBinding, TaskExecutor } from "@relkit/jobs/adapter";
import { Inngest } from "inngest";
import type { Context, InngestFunction } from "inngest";
import type { InngestTaskDefinition } from "./task-binding.js";
import { createInngestFunctionConfig, loadInngestSdk } from "./task-binding.js";
import {
  duration,
  envelopeFrom,
  record,
  scheduleMetadata,
  signalFrom,
  wireInput,
} from "./task-binding-support.js";

export function createInngestFunction(
  client: Inngest.Any,
  definition: InngestTaskDefinition,
  executor: TaskExecutor,
  activeSignals: Set<AbortController> = new Set(),
): InngestFunction.Any {
  return client.createFunction(
    createInngestFunctionConfig(definition) as never,
    async (ctx: Context) => {
      const scheduled =
        definition.schedule !== undefined && ctx.event.name === "inngest/scheduled.timer";
      const data = record(ctx.event.data) ?? {};
      const native = scheduled ? scheduleMetadata(ctx, definition) : record(data.relkit);
      const input = scheduled ? wireInput(definition.schedule!.input) : data.input;
      if (native === undefined || input === undefined)
        throw new Error("RELKIT_INNGEST_EVENT_INVALID");
      const envelope = envelopeFrom(ctx, native, input);
      const providerSignal = signalFrom(ctx);
      const controller = providerSignal === undefined ? new AbortController() : undefined;
      if (controller !== undefined) activeSignals.add(controller);
      const binding: TaskExecutionBinding = {
        run: {
          runId: envelope.runId,
          jobId: envelope.jobId,
          taskId: envelope.taskId,
          taskVersion: envelope.taskVersion,
          buildId: envelope.buildId,
          ...(envelope.service === undefined ? {} : { service: envelope.service }),
          ...(envelope.serviceGeneration === undefined
            ? {}
            : { serviceGeneration: envelope.serviceGeneration }),
          ...(envelope.attempt === undefined ? {} : { attempt: envelope.attempt }),
          ...(envelope.acceptedAt === undefined ? {} : { acceptedAt: envelope.acceptedAt }),
          ...(envelope.scheduledFor === undefined ? {} : { scheduledFor: envelope.scheduledFor }),
          ...(envelope.parentRunId === undefined ? {} : { parentRunId: envelope.parentRunId }),
          ...(envelope.scope === undefined ? {} : { scope: envelope.scope }),
          ...(envelope.inputSchemaHash === undefined
            ? {}
            : { inputSchemaHash: envelope.inputSchemaHash }),
          ...(envelope.acceptanceIdentity === undefined
            ? {}
            : { acceptanceIdentity: envelope.acceptanceIdentity }),
          ...(envelope.occurrenceIdentity === undefined
            ? {}
            : { occurrenceIdentity: envelope.occurrenceIdentity }),
          ...(envelope.propagation === undefined ? {} : { propagation: envelope.propagation }),
        },
        signal: providerSignal ?? controller!.signal,
        sleep: {
          sleep: async (key, durationMs) => {
            await ctx.step.sleep(key, duration(durationMs));
          },
          sleepUntil: async (key, instant) => {
            await ctx.step.sleepUntil(key, instant);
          },
        },
      };
      try {
        return await executor.execute(envelope, binding);
      } finally {
        if (controller !== undefined) activeSignals.delete(controller);
      }
    },
  );
}
