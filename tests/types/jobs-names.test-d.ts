import { defineJob } from "@relkit/app/jobs";
import { defineTask } from "@relkit/app/tasks";
import { defineError, defineFunction } from "@relkit/app/functions";
import type {
  TaskCallerInput,
  TaskCanonicalInput,
  TaskHandler,
  TaskProgressInput,
  TaskProgressOutput,
  TaskRawHandlerOutput,
  TaskStreamInput,
  TaskStreamOutput,
  TaskSuccessHook,
  TaskValidatedOutput,
} from "@relkit/app/tasks";
import type { JobsAdapterRuntime } from "@relkit/jobs/adapter";
import type { TaskRef } from "@relkit/contracts/jobs";
import type { RunWithJobsConfig, TriggerOptions } from "@relkit/jobs/server";
import { defineJob as defineLegacyJob } from "@relkit/jobs/legacy";
import { z } from "@relkit/schema";

const input = z.object({ id: z.string(), tenantId: z.string() });
const output = z.object({ accepted: z.literal(true) });
const task = defineTask({
  id: "types.jobs-task",
  version: "1",
  input,
  output,
  streams: { text: z.string() },
  handler: async () => ({ accepted: true as const }),
});
const job = defineJob({
  name: "sendEmail",
  task,
  client: {
    public: true,
    operations: ["trigger", "get", "list", "watch", "cancel", "retry", "stream"],
    fields: ["status", "output"],
    streams: ["text"],
  },
});

const accepted = job.trigger(
  { id: "order-1", tenantId: "tenant-1" },
  { operationId: "operation-1", signal: new AbortController().signal },
);
const taskAccepted = task.trigger(
  { id: "order-1", tenantId: "tenant-1" },
  { operationId: "operation-2", job },
);
void accepted;
void taskAccepted;

const transformedInput = z.string().transform(Number);
const transformedOutput = z.string().transform(Number);
type TransformedRef = TaskRef<"types.transformed-ref", typeof transformedInput, typeof transformedOutput>;
const directionalTask = defineTask({
  id: "types.directional-task",
  version: "1",
  input: transformedInput,
  inputWire: z.number(),
  output: z.number(),
  handler: async (value) => {
    const canonical: number = value;
    return canonical;
  },
  onStart: async (value) => {
    const canonical: number = value;
    void canonical;
  },
  onSuccess: async (value) => {
    const canonical: number = value;
    void canonical;
  },
});
const callerInput: TaskCallerInput<typeof directionalTask> = "7";
const canonicalInput: TaskCanonicalInput<typeof directionalTask> = 7;
const rawOutput: TaskRawHandlerOutput<typeof directionalTask> = 7;
const validatedOutput: TaskValidatedOutput<typeof directionalTask> = 7;
const transformedRawOutput: TaskRawHandlerOutput<TransformedRef> = "7";
const transformedValidatedOutput: TaskValidatedOutput<TransformedRef> = 7;
const progressInput: TaskProgressInput<typeof transformedOutput> = "7";
const progressOutput: TaskProgressOutput<typeof transformedOutput> = 7;
const streamInput: TaskStreamInput<typeof transformedOutput> = "7";
const streamOutput: TaskStreamOutput<typeof transformedOutput> = 7;
const successHook: TaskSuccessHook<typeof transformedOutput, {}, []> = async (value) => {
  const canonical: number = value;
  void canonical;
};
type DirectionalHandler = TaskHandler<
  typeof transformedInput,
  typeof transformedOutput,
  "retryable",
  {},
  readonly [],
  undefined,
  {},
  readonly []
>;
void callerInput;
void canonicalInput;
void rawOutput;
void validatedOutput;
void transformedRawOutput;
void transformedValidatedOutput;
void progressInput;
void progressOutput;
void streamInput;
void streamOutput;
void successHook;
void directionalTask;
void (undefined as DirectionalHandler | undefined);

const declaredFailure = defineError({
  id: "types.jobs-failure",
  data: z.object({ reason: z.string() }),
  message: ({ reason }) => reason,
  retry: "never",
});
const failureTask = defineTask({
  id: "types.failure-task",
  version: "1",
  input,
  output: z.number(),
  errors: [declaredFailure],
  handler: async () => new declaredFailure({ reason: "no" }),
});
void failureTask;

// @ts-expect-error job names are lowercase camelCase, never kebab-case
defineJob({ name: "send-email", task });
// @ts-expect-error generated names reserve prototype properties
defineJob({ name: "constructor", task });
const dynamicJobName: string = "dynamicJob";
// @ts-expect-error job names must be literal strings
defineJob({ name: dynamicJobName, task });
// @ts-expect-error authorization must return a scoped grant
defineJob({ name: "booleanAuthorization", task, client: { authorize: async () => true, operations: ["get"] } });
// @ts-expect-error a generated registry is selected by literal names
({ sendEmail: job } as const).missing;

const functionTarget = defineFunction({ input, output, handler: async () => ({ accepted: true as const }) });
// @ts-expect-error new jobs accept tasks, not function targets
defineJob({ name: "functionTarget", task: functionTarget });
// @ts-expect-error jobs do not own handlers
defineJob({ name: "jobHandler", task, handler: async () => ({ accepted: true as const }) });
// @ts-expect-error task versions are explicit
defineTask({ id: "types.missing-version", input, output, handler: async () => ({ accepted: true as const }) });
defineTask({
  id: "types.retryable-sleep",
  version: "1",
  execution: "retryable",
  input,
  output,
  handler: async (_value, context) => {
    // @ts-expect-error retryable task contexts do not expose durable sleep
    await context.sleep("1 second", { key: "wait" });
    return { accepted: true as const };
  },
});
// @ts-expect-error the public duration grammar excludes calendar months
defineTask({ id: "types.bad-duration", version: "1", input, output, maxDuration: "1 month", handler: async () => ({ accepted: true as const }) });
// @ts-expect-error only declared stream names may be exposed
defineJob({ name: "badStream", task, client: { public: true, operations: ["stream"], streams: ["missing"] } });
// @ts-expect-error operation names are capability-gated
defineJob({ name: "badOperation", task, client: { public: true, operations: ["delete"] } });
// @ts-expect-error public and authorize are an exclusive union
defineJob({ name: "badAccess", task, client: { public: true, authorize: async () => true, operations: ["get"] } });
defineTask({
  id: "types.missing-dependency",
  version: "1",
  input,
  output,
  handler: async (_value, context) => {
    // @ts-expect-error undeclared job dependencies are not exposed
    await context.jobs.sendEmail.trigger({ id: "x", tenantId: "t" });
    return { accepted: true as const };
  },
});
// @ts-expect-error browser-safe options do not carry server AbortSignal
const browserOptions: TriggerOptions = { signal: new AbortController().signal };
void browserOptions;

declare const adapter: JobsAdapterRuntime;
const serverConfig: RunWithJobsConfig = { projectRoot: "/tmp/project" };
void adapter;
void serverConfig;

const legacyTarget = defineFunction({ input, output, handler: async () => ({ accepted: true as const }) });
const legacy = defineLegacyJob({
  id: "types.legacy-job",
  input,
  target: legacyTarget,
  retry: { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" },
});
void legacy;
