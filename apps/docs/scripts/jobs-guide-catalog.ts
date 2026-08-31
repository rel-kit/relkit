import type { ApiPackage } from "./documentation-catalog.js";

export const jobsGuideGroup = {
  directory: "jobs",
  title: "Jobs",
  icon: "ListTodo",
  pages: ["index", "define", "enqueue", "retries", "idempotency", "schedules", "first-job"],
} as const;

export const jobsGuideRelations = [
  {
    path: "jobs/index",
    api: ["jobs", "services", "functions"],
    examples: ["examples/commerce/src/receipts/jobs/send-receipt.job.ts"],
  },
  {
    path: "jobs/define",
    api: ["jobs", "functions", "config"],
    examples: ["examples/commerce/src/receipts/jobs/send-receipt.job.ts"],
  },
  {
    path: "jobs/enqueue",
    api: ["jobs", "functions", "events"],
    examples: ["examples/commerce/tests/fixtures/queue-receipt.function.ts"],
  },
  {
    path: "jobs/retries",
    api: ["jobs", "functions", "testing"],
    examples: ["examples/commerce/src/receipts/jobs/send-receipt.job.ts"],
  },
  {
    path: "jobs/idempotency",
    api: ["jobs", "testing"],
    examples: ["examples/commerce/tests/jobs.test.ts"],
  },
  {
    path: "jobs/schedules",
    api: ["jobs"],
    examples: [
      "examples/commerce/src/receipts/jobs/send-receipt.job.ts",
      "tests/integration/jobs/commerce-example.test.ts",
    ],
  },
  {
    path: "jobs/first-job",
    api: ["jobs", "functions", "buckets", "testing"],
    examples: ["examples/commerce/tests/jobs.test.ts"],
  },
] satisfies readonly {
  path: string;
  api: readonly ApiPackage[];
  examples: readonly string[];
}[];
