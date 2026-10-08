import { Effect, Option } from "effect";
import { Command } from "effect/cli";
import {
  document,
  optionArgs,
  optionalInteger,
  optionalString,
  type SelectInvocation,
} from "./cli-command-shared.js";
import { runCommands } from "./cli-command-jobs-runs.js";
import type { OptionalStringFlag } from "./cli-command.types.js";
/** Builds job control syntax while native clients and streams remain execution-owned.
 *
 * @param select - Invocation recorder.
 *
 * @returns The pure jobs parser tree.
 */
export function jobsCommand(select: SelectInvocation) {
  const list = command(select, "list");
  const runs = runCommands(select);
  const schedules = Command.make("schedules").pipe(
    Command.withSubcommands([
      scheduleList(select),
      scheduleGet(select),
      scheduleWrite(select, "upsert"),
      scheduleWrite(select, "pause"),
      scheduleWrite(select, "resume"),
      scheduleWrite(select, "delete"),
    ]),
  );
  const trigger = simple(select, "trigger", [
    "job",
    "input-file",
    "idempotency-key",
    "operation-id",
    "delay",
    "at",
  ]);
  const cancel = simple(select, "cancel", ["run-id", "operation-id", "reason"]);
  const retry = simple(select, "retry", ["run-id", "operation-id"]);
  const capabilities = simple(select, "capabilities", ["service", "environment"]);
  return document(
    Command.make("jobs").pipe(
      Command.withSubcommands([list, runs, trigger, cancel, retry, capabilities, schedules]),
    ),
    ["jobs"],
  );
}
/**
 * Builds the job definition listing parser.
 * @param select - Invocation recorder.
 * @param name - Definition listing operation.
 *
 * @returns Listing syntax with project, environment and service selection.
 */
function command(select: SelectInvocation, name: "list") {
  const path = ["jobs", name] as const;
  return document(
    Command.make(
      name,
      {
        projectRoot: optionalString(path, "project-root"),
        environment: optionalString(path, "environment"),
        service: optionalString(path, "service"),
      },
      (value) =>
        Effect.sync(() =>
          select("jobs", [
            name,
            ...optionArgs("project-root", value.projectRoot),
            ...optionArgs("environment", value.environment),
            ...optionArgs("service", value.service),
          ]),
        ),
    ),
    path,
  );
}
/**
 * Builds native schedule listing syntax.
 * @param select - Invocation recorder.
 * @returns Native schedule listing syntax.
 */
function scheduleList(select: SelectInvocation) {
  const path = ["jobs", "schedules", "list"] as const;
  return document(
    Command.make(
      "list",
      {
        projectRoot: optionalString(path, "project-root"),
        environment: optionalString(path, "environment"),
        service: optionalString(path, "service"),
        job: optionalString(path, "job"),
        limit: optionalInteger(path, "limit"),
        cursor: optionalString(path, "cursor"),
      },
      (value) => Effect.sync(() => select("jobs", ["schedules", "list", ...serialize(value)])),
    ),
    path,
  );
}
/**
 * Builds native schedule identity syntax.
 * @param select - Invocation recorder.
 * @returns Native schedule identity syntax.
 */
function scheduleGet(select: SelectInvocation) {
  const path = ["jobs", "schedules", "get"] as const;
  return document(
    Command.make(
      "get",
      {
        projectRoot: optionalString(path, "project-root"),
        environment: optionalString(path, "environment"),
        service: optionalString(path, "service"),
        scheduleId: optionalString(path, "schedule-id"),
      },
      (value) => Effect.sync(() => select("jobs", ["schedules", "get", ...serialize(value)])),
    ),
    path,
  );
}
/**
 * Builds native schedule mutation syntax.
 * @param select - Invocation recorder.
 * @param name - Native schedule operation.
 *
 * @returns Explicit control identity and optional upsert definition syntax.
 */
function scheduleWrite(select: SelectInvocation, name: "upsert" | "pause" | "resume" | "delete") {
  const path = ["jobs", "schedules", name] as const;
  const fields = {
    projectRoot: optionalString(path, "project-root"),
    environment: optionalString(path, "environment"),
    service: optionalString(path, "service"),
    scheduleId: optionalString(path, "schedule-id"),
    operationId: optionalString(path, "operation-id"),
    ...(name === "upsert" ? { definitionFile: optionalString(path, "definition-file") } : {}),
  };
  return document(
    Command.make(name, fields, (value) =>
      Effect.sync(() => select("jobs", ["schedules", name, ...serialize(value)])),
    ),
    path,
  );
}
/**
 * Builds typed dynamic job-control flags.
 * @param select - Invocation recorder.
 * @param name - Job control operation.
 *
 * @param options - Operation-specific literal flag names.
 *
 * @returns A typed dynamic string-flag parser without erased command input.
 */
function simple(
  select: SelectInvocation,
  name: "trigger" | "cancel" | "retry" | "capabilities",
  options: readonly string[],
) {
  const path = ["jobs", name] as const;
  const fields: Record<string, OptionalStringFlag> = {};
  for (const option of ["project-root", "environment", "service", ...options])
    fields[option.replaceAll("-", "_")] = optionalString(path, option);
  return document(
    Command.make(name, fields, (value) =>
      Effect.sync(() => select("jobs", [name, ...serialize(value)])),
    ),
    path,
  );
}
/**
 * Serializes parsed fields in their established order.
 * @param value - Parsed job fields.
 * @returns Literal flags in existing field order.
 */
function serialize(value: Readonly<Record<string, unknown>>): readonly string[] {
  return Object.entries(value).flatMap(([name, raw]) => {
    const option = name
      .replaceAll("_", "-")
      .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    if (Array.isArray(raw)) return raw.flatMap((entry) => [`--${option}`, String(entry)]);
    if (Option.isOption(raw) && Option.isSome(raw)) return [`--${option}`, String(raw.value)];
    return raw === true ? [`--${option}`] : [];
  });
}
