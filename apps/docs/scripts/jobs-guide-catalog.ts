/** Defines job guide ordering and grouped task/job/provider evidence relations; catalog construction schedules no work. */
import type { ApiPackage } from "./documentation-catalog.js";

export const jobsGuideGroup = {
  directory: "docs/modules/jobs",
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
    path: "docs/modules/jobs/index",
    api: ["jobs", "services", "client"],
    examples: ["examples/commerce/src/services/orders/jobs/export-orders.job.ts"],
  },
  {
    path: "docs/modules/jobs/quickstart",
    api: ["app", "jobs", "schema", "client"],
    examples: [
      "examples/commerce/src/services/orders/tasks/export-orders.task.ts",
      "examples/commerce/src/services/orders/jobs/export-orders.job.ts",
      "examples/commerce/src/routes/orders/export/route.ts",
    ],
  },
  {
    path: "docs/modules/jobs/tasks",
    api: ["jobs", "schema"],
    examples: ["examples/commerce/src/services/orders/tasks/export-orders.task.ts"],
  },
  {
    path: "docs/modules/jobs/bindings",
    api: ["app", "jobs", "integrations/docker", "integrations/inngest"],
    examples: [
      "examples/commerce/relkit.config.ts",
      "examples/commerce/src/services/orders/jobs/export-orders.job.ts",
    ],
  },
  {
    path: "docs/modules/jobs/durations-and-sleep",
    api: ["jobs"],
    examples: ["examples/commerce/src/services/orders/tasks/export-orders.task.ts"],
  },
  {
    path: "docs/modules/jobs/execution-policy",
    api: ["jobs"],
    examples: ["examples/commerce/src/services/orders/tasks/export-orders.task.ts"],
  },
  {
    path: "docs/modules/jobs/retries-and-idempotency",
    api: ["jobs", "testing"],
    examples: [
      "examples/commerce/src/services/orders/tasks/export-orders.task.ts",
      "packages/jobs/tests/task-policy.test.ts",
    ],
  },
  {
    path: "docs/modules/jobs/clients",
    api: ["jobs", "client"],
    examples: ["apps/docs/examples/jobs/watch-run.ts"],
  },
  {
    path: "docs/modules/jobs/progress-and-streams",
    api: ["jobs", "client"],
    examples: ["examples/commerce/src/services/orders/tasks/export-orders.task.ts"],
  },
  {
    path: "docs/modules/jobs/security",
    api: ["jobs", "client"],
    examples: ["examples/commerce/src/services/orders/jobs/export-orders.job.ts"],
  },
  {
    path: "docs/modules/jobs/schedules",
    api: ["jobs", "integrations/inngest", "integrations/effect-mq"],
    examples: [
      "examples/commerce/src/services/orders/jobs/cleanup-orders.job.ts",
      "packages/jobs/tests/schedule-reconciliation.test.ts",
    ],
  },
  {
    path: "docs/modules/jobs/inspector",
    api: ["jobs", "client"],
    examples: ["tests/inspector/job-name-filters.test.ts"],
  },
  {
    path: "docs/modules/jobs/docker",
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
    path: "docs/modules/jobs/providers/index",
    api: ["integrations/inngest", "integrations/trigger", "integrations/effect-mq"],
    examples: ["tests/jobs/compatibility/evidence/capability-matrix.json"],
  },
  {
    path: "docs/modules/jobs/deployment",
    api: ["jobs", "integrations/pulumi"],
    examples: ["examples/commerce/relkit.config.ts"],
  },
  {
    path: "docs/modules/jobs/testing",
    api: ["jobs", "testing", "client"],
    examples: [
      "packages/jobs/tests/task-wire.test.ts",
      "packages/client/tests/compatibility/jobs-watch.test.ts",
    ],
  },
  {
    path: "docs/modules/jobs/migration",
    api: ["app", "jobs"],
    examples: [
      "packages/jobs/tests/migration.test.ts",
      "apps/docs/examples/jobs/send-receipt.job.ts",
    ],
  },
  {
    path: "docs/modules/jobs/troubleshooting",
    api: ["jobs"],
    examples: ["templates/default/v1/tasks/package.json"],
  },
] satisfies readonly {
  path: string;
  api: readonly ApiPackage[];
  examples: readonly string[];
}[];
