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
    examples: ["apps/docs/examples/jobs/send-receipt.job.ts"],
  },
  {
    path: "jobs/define",
    api: ["jobs", "functions", "config"],
    examples: ["apps/docs/examples/jobs/send-receipt.job.ts"],
  },
  {
    path: "jobs/enqueue",
    api: ["jobs", "functions", "events"],
    examples: ["apps/docs/examples/jobs/queue-receipt.function.ts"],
  },
  {
    path: "jobs/retries",
    api: ["jobs", "functions", "testing"],
    examples: ["apps/docs/examples/jobs/send-receipt.job.ts"],
  },
  {
    path: "jobs/idempotency",
    api: ["jobs", "testing"],
    examples: ["packages/testing/jobs.test.ts"],
  },
  {
    path: "jobs/schedules",
    api: ["jobs"],
    examples: ["apps/docs/examples/jobs/send-receipt.job.ts", "packages/testing/jobs.test.ts"],
  },
  {
    path: "jobs/first-job",
    api: ["jobs", "functions", "buckets", "testing"],
    examples: ["packages/testing/jobs.test.ts"],
  },
] satisfies readonly {
  path: string;
  api: readonly ApiPackage[];
  examples: readonly string[];
}[];
