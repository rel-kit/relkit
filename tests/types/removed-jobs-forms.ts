/** Checks that the removed job spellings no longer type-check: `defineApp`'s `job` key and `profile`. */
import { defineApp, defineEnv, type AppProviderInputs } from "relkit/config";
import { defineJob, defineTask } from "relkit/jobs";
import { z } from "relkit/schema";

declare const jobsProvider: NonNullable<AppProviderInputs["jobs"]>;
const env = defineEnv({});

defineApp({ env, jobs: jobsProvider, defaults: { jobs: "default" } });
// @ts-expect-error the singular `job` provider key was removed; use `jobs`
defineApp({ env, job: jobsProvider });
// @ts-expect-error the singular `defaults.job` key was removed; use `defaults.jobs`
defineApp({ env, jobs: jobsProvider, defaults: { job: "default" } });
// @ts-expect-error `compatibility.legacyJobs` was removed with the legacy jobs
defineApp({ env, compatibility: { legacyJobs: true } });

const task = defineTask({
  id: "types.removed-forms-task",
  version: "1",
  input: z.object({ orderId: z.string() }),
  output: z.object({ sent: z.boolean() }),
  handler: async () => ({ sent: true }),
});

defineJob({ name: "sendReceipt", task, service: "default" });
// @ts-expect-error the `profile` alias for `service` was removed
defineJob({ name: "sendReceiptByProfile", task, profile: "default" });
// @ts-expect-error jobs bind a task; function targets were removed with the legacy jobs
defineJob({ id: "types.function-target", name: "functionTarget", target: task, retry: {} });
