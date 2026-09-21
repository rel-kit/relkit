import { command, option, title } from "./cli-help-builders.js";
import { environment, projectRoot } from "./cli-help-options.js";

export const jobs = command(
  "jobs",
  "Inspect and operate task-backed jobs",
  "relkit jobs <command>",
  {
    commands: [
      command("list", "List compiled job definitions", "relkit jobs list", {
        options: [projectRoot, environment, option("service", "string", "Jobs service profile")],
      }),
      command("runs", "Inspect accepted job runs", "relkit jobs runs <command>", {
        commands: [
          command("list", "List runs with native filters", "relkit jobs runs list", {
            options: [
              projectRoot,
              environment,
              option("service", "string", "Jobs service profile"),
              option("job", "string", "Job name or ID"),
              option("task-id", "string", "Task ID"),
              option(
                "status",
                "choice",
                "Run status",
                [],
                [
                  "accepted",
                  "running",
                  "sleeping",
                  "retrying",
                  "completed",
                  "failed",
                  "cancelled",
                  "timed-out",
                ],
              ),
              option("from", "string", "Lower time bound"),
              option("to", "string", "Upper time bound"),
              option("tag", "string", "Run tag; repeatable", [], undefined, true),
              option("tag-match", "choice", "Tag matching mode", [], ["all", "any"]),
              option("limit", "integer", "Rows (1-100)"),
              option("cursor", "string", "Opaque page cursor"),
            ],
          }),
          command("get", "Read one run", "relkit jobs runs get", {
            options: [
              projectRoot,
              environment,
              option("service", "string", "Jobs service profile"),
              option("run-id", "string", "Opaque run locator"),
            ],
          }),
          command("watch", "Watch one run as newline-delimited frames", "relkit jobs runs watch", {
            options: [
              projectRoot,
              environment,
              option("service", "string", "Jobs service profile"),
              option("run-id", "string", "Opaque run locator"),
              option("after", "string", "Resume cursor"),
            ],
          }),
        ],
      }),
      command("trigger", "Submit validated task input", "relkit jobs trigger", {
        options: [
          projectRoot,
          environment,
          option("service", "string", "Jobs service profile"),
          option("job", "string", "Job name or ID"),
          option("input-file", "string", "JSON input file"),
          option("idempotency-key", "string", "External idempotency key"),
          option("operation-id", "string", "Stable operation ID"),
          option("delay", "string", "Readable delay"),
          option("at", "string", "RFC3339 scheduled time"),
        ],
      }),
      command("cancel", "Cancel one run", "relkit jobs cancel", {
        options: [
          projectRoot,
          environment,
          option("service", "string", "Jobs service profile"),
          option("run-id", "string", "Opaque run locator"),
          option("operation-id", "string", "Required control operation ID"),
          option("reason", "string", "Cancellation reason"),
        ],
      }),
      command("retry", "Retry one terminal run", "relkit jobs retry", {
        options: [
          projectRoot,
          environment,
          option("service", "string", "Jobs service profile"),
          option("run-id", "string", "Opaque run locator"),
          option("operation-id", "string", "Required control operation ID"),
        ],
      }),
      command("capabilities", "Show provider capability reports", "relkit jobs capabilities", {
        options: [projectRoot, environment, option("service", "string", "Jobs service profile")],
      }),
      command("schedules", "Administer native schedules", "relkit jobs schedules <command>", {
        commands: [
          command("list", "List schedules", "relkit jobs schedules list", {
            options: [
              projectRoot,
              environment,
              option("service", "string", "Jobs service profile"),
              option("job", "string", "Job name or ID"),
              option("limit", "integer", "Rows (1-100)"),
              option("cursor", "string", "Opaque page cursor"),
            ],
          }),
          command("get", "Read one schedule", "relkit jobs schedules get", {
            options: [
              projectRoot,
              environment,
              option("service", "string", "Jobs service profile"),
              option("schedule-id", "string", "Schedule ID"),
            ],
          }),
          command("upsert", "Create or update a schedule", "relkit jobs schedules upsert", {
            options: [
              projectRoot,
              environment,
              option("service", "string", "Jobs service profile"),
              option("schedule-id", "string", "Schedule ID"),
              option("definition-file", "string", "JSON definition file"),
              option("operation-id", "string", "Stable operation ID"),
            ],
          }),
          ...["pause", "resume", "delete"].map((name) =>
            command(name, `${title(name)} a schedule`, `relkit jobs schedules ${name}`, {
              options: [
                projectRoot,
                environment,
                option("service", "string", "Jobs service profile"),
                option("schedule-id", "string", "Schedule ID"),
                option("operation-id", "string", "Stable operation ID"),
              ],
            }),
          ),
        ],
      }),
    ],
  },
);
