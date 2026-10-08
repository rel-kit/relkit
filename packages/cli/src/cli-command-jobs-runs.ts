import { Effect, Option } from "effect";
import { Command } from "effect/cli";
import {
  document,
  optionalChoice,
  optionalInteger,
  optionalString,
  repeatedString,
  type SelectInvocation,
} from "./cli-command-shared.js";
/** Builds run-list/get/watch syntax without acquiring run streams.
 *
 * @param select - Invocation recorder.
 *
 * @returns The pure runs parser group.
 */
export function runCommands(select: SelectInvocation) {
  return Command.make("runs").pipe(
    Command.withSubcommands([runList(select), runGet(select), runWatch(select)]),
  );
}
/**
 * Builds native run-filter syntax.
 * @param select - Invocation recorder.
 * @returns Typed native run filter syntax.
 */
function runList(select: SelectInvocation) {
  const path = ["jobs", "runs", "list"] as const;
  return document(
    Command.make(
      "list",
      {
        projectRoot: optionalString(path, "project-root"),
        environment: optionalString(path, "environment"),
        service: optionalString(path, "service"),
        job: optionalString(path, "job"),
        taskId: optionalString(path, "task-id"),
        status: optionalChoice(path, "status"),
        from: optionalString(path, "from"),
        to: optionalString(path, "to"),
        tag: repeatedString(path, "tag"),
        tagMatch: optionalChoice(path, "tag-match"),
        limit: optionalInteger(path, "limit"),
        cursor: optionalString(path, "cursor"),
      },
      (value) => Effect.sync(() => select("jobs", ["runs", "list", ...serialize(value)])),
    ),
    path,
  );
}
/**
 * Builds opaque run-identity syntax.
 * @param select - Invocation recorder.
 * @returns Opaque run identity syntax.
 */
function runGet(select: SelectInvocation) {
  const path = ["jobs", "runs", "get"] as const;
  return document(
    Command.make(
      "get",
      {
        projectRoot: optionalString(path, "project-root"),
        environment: optionalString(path, "environment"),
        service: optionalString(path, "service"),
        runId: optionalString(path, "run-id"),
      },
      (value) => Effect.sync(() => select("jobs", ["runs", "get", ...serialize(value)])),
    ),
    path,
  );
}
/**
 * Builds resume-aware run-watch syntax.
 * @param select - Invocation recorder.
 * @returns Resume-aware run watch syntax.
 */
function runWatch(select: SelectInvocation) {
  const path = ["jobs", "runs", "watch"] as const;
  return document(
    Command.make(
      "watch",
      {
        projectRoot: optionalString(path, "project-root"),
        environment: optionalString(path, "environment"),
        service: optionalString(path, "service"),
        runId: optionalString(path, "run-id"),
        after: optionalString(path, "after"),
      },
      (value) => Effect.sync(() => select("jobs", ["runs", "watch", ...serialize(value)])),
    ),
    path,
  );
}
/**
 * Serializes parsed fields in their established order.
 * @param value - Parsed run fields.
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
