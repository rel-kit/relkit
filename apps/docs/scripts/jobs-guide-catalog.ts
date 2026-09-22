import type { ApiPackage } from "./documentation-catalog.js";

export const jobsGuideGroup = {
  directory: "jobs",
  title: "Jobs",
  icon: "ListTodo",
  pages: [
    "index",
    "quickstart",
    "tasks",
    "bindings",
    "durations-and-sleep",
    "execution-policy",
    "retries-and-idempotency",
    "clients",
    "progress-and-streams",
    "security",
    "schedules",
    "inspector",
    "docker",
    "providers",
    "deployment",
    "testing",
    "migration",
    "troubleshooting",
  ],
} as const;

export const jobsGuideRelations = [
  {
    path: "jobs/index",
    api: ["jobs", "services", "client"],
    examples: ["examples/commerce/src/orders/jobs/export-orders.job.ts"],
  },
  {
    path: "jobs/quickstart",
    api: ["app", "jobs", "schema", "client"],
    examples: [
      "examples/commerce/src/orders/tasks/export-orders.task.ts",
      "examples/commerce/src/orders/jobs/export-orders.job.ts",
      "examples/commerce/src/routes/orders/export/route.ts",
    ],
  },
  {
    path: "jobs/tasks",
    api: ["jobs", "schema"],
    examples: ["examples/commerce/src/orders/tasks/export-orders.task.ts"],
  },
  {
    path: "jobs/bindings",
    api: ["app", "jobs", "integrations/docker", "integrations/inngest"],
    examples: [
      "examples/commerce/relkit.config.ts",
      "examples/commerce/src/orders/jobs/export-orders.job.ts",
    ],
  },
  {
    path: "jobs/durations-and-sleep",
    api: ["jobs"],
    examples: ["examples/commerce/src/orders/tasks/export-orders.task.ts"],
  },
  {
    path: "jobs/execution-policy",
    api: ["jobs"],
    examples: ["examples/commerce/src/orders/tasks/export-orders.task.ts"],
  },
  {
    path: "jobs/retries-and-idempotency",
    api: ["jobs", "testing"],
    examples: [
      "examples/commerce/src/orders/tasks/export-orders.task.ts",
      "packages/jobs/task-policy.test.ts",
    ],
  },
  {
    path: "jobs/clients",
    api: ["jobs", "client"],
    examples: ["apps/docs/examples/jobs/watch-run.ts"],
  },
  {
    path: "jobs/progress-and-streams",
    api: ["jobs", "client"],
    examples: ["examples/commerce/src/orders/tasks/export-orders.task.ts"],
  },
  {
    path: "jobs/security",
    api: ["jobs", "client"],
    examples: ["examples/commerce/src/orders/jobs/export-orders.job.ts"],
  },
  {
    path: "jobs/schedules",
    api: ["jobs", "integrations/inngest", "integrations/effect-mq"],
    examples: [
      "examples/commerce/src/orders/jobs/cleanup-orders.job.ts",
      "packages/jobs/schedule-reconciliation.test.ts",
    ],
  },
  {
    path: "jobs/inspector",
    api: ["jobs", "client"],
    examples: ["tests/inspector/job-name-filters.test.ts"],
  },
  {
    path: "jobs/docker",
    api: [
      "app",
      "jobs",
      "integrations/docker",
      "integrations/inngest",
      "integrations/trigger",
      "integrations/effect-mq",
    ],
    examples: ["templates/default/v1/tasks/relkit.config.ts"],
  },
  {
    path: "jobs/providers",
    api: ["integrations/inngest", "integrations/trigger", "integrations/effect-mq"],
    examples: ["tests/jobs/compatibility/evidence/capability-matrix.json"],
  },
  {
    path: "jobs/deployment",
    api: ["jobs", "integrations/pulumi"],
    examples: ["examples/commerce/relkit.config.ts"],
  },
  {
    path: "jobs/testing",
    api: ["jobs", "testing", "client"],
    examples: ["packages/jobs/task-wire.test.ts", "packages/client/jobs-watch.test.ts"],
  },
  {
    path: "jobs/migration",
    api: ["app", "jobs"],
    examples: ["packages/jobs/migration.test.ts", "apps/docs/examples/jobs/send-receipt.job.ts"],
  },
  {
    path: "jobs/troubleshooting",
    api: ["jobs"],
    examples: ["templates/default/v1/tasks/package.json"],
  },
] satisfies readonly {
  path: string;
  api: readonly ApiPackage[];
  examples: readonly string[];
}[];
