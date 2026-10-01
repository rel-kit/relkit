import { defineFunction } from "@relkit/app/functions";
import { defineService } from "@relkit/app/services";
import { defineTask } from "@relkit/app/tasks";
import { defineJob } from "@relkit/app/jobs";
import { defineEvent } from "@relkit/app/events";
import { defineApp, defineEnv, env } from "@relkit/app/config";
import { defineServiceRoutes } from "@relkit/app/routes";
import { z, type InferInput, type InferOutput } from "@relkit/app/schema";
import { redis } from "@relkit/redis";

type IsAny<Value> = 0 extends 1 & Value ? true : false;
type AssertFalse<Value extends false> = Value;

const example = defineFunction({
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: ({ id }) => ({ id }),
});
const service = defineService({ functions: { example } });
const routes = defineServiceRoutes(service, { GET: "example" });
const created = defineEvent({ id: "types.audit-created", input: z.object({ id: z.string() }) });
const task = defineTask({
  id: "types.audit-task",
  version: "1",
  input: z.string(),
  output: z.string(),
  handler: (input) => input,
});
const job = defineJob({ name: "typeAudit", task });
const provider = redis({ url: env.secret("CACHE_URL") });
const application = defineApp({
  env: defineEnv({}),
  cache: { primary: provider },
  defaults: { cache: "primary" },
});

export type AuthoringTypeEvidence = [
  AssertFalse<IsAny<Parameters<typeof example.invoke>[0]>>,
  AssertFalse<IsAny<Awaited<ReturnType<typeof example.invoke>>>>,
  AssertFalse<IsAny<typeof service.example>>,
  AssertFalse<IsAny<typeof routes.GET>>,
  AssertFalse<IsAny<typeof routes.GET.target>>,
  AssertFalse<IsAny<InferInput<typeof created.input>>>,
  AssertFalse<IsAny<InferInput<typeof task.input>>>,
  AssertFalse<IsAny<InferOutput<typeof task.output>>>,
  AssertFalse<IsAny<typeof job>>,
  AssertFalse<IsAny<typeof provider>>,
  AssertFalse<IsAny<typeof application.defaults.cache>>,
];

// @ts-expect-error service calls preserve the function input contract
service.example.invoke({ id: 123 });
// @ts-expect-error service membership is closed
service.missing;
// @ts-expect-error route targets retain the same function input contract
routes.GET.target.invoke({ id: 123 });
defineTask({
  id: "types.audit-invalid-task",
  version: "1",
  input: z.string(),
  output: z.string(),
  // @ts-expect-error task output must agree with its schema
  handler: () => 123,
});
