import { Cause, Effect } from "effect";
import { CLI_EXIT_CODES } from "../main-support.js";
import { cliOriginalError, cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliJobs, jobsLiveLayer } from "../services/jobs.service.js";
import { encode, JobsCommandError, parse, requireOption, usage } from "./jobs-support.js";
import type { JobsCommandContext, JobsRequestOptions, ParsedJobs } from "./jobs.types.js";

/**
 * Runs the existing public jobs command through one acquired graph.
 * @param args - Original jobs arguments.
 * @param context - Existing reporter and caller cancellation.
 * @returns Existing status after request/iterator cleanup.
 */
export async function runJobs(
  args: readonly string[],
  context: JobsCommandContext,
): Promise<number> {
  try {
    return await runCliEffect(runJobsEffect(args, context), jobsLiveLayer(), context.signal);
  } catch (error) {
    return reportJobsFailure(error, context);
  }
}

/**
 * Composes jobs control and stream operations through explicit domain authority.
 * @param args - Original jobs arguments.
 * @param context - Existing reporter and caller cancellation.
 * @returns Lazy established status requiring only CliJobs.
 */
export const runJobsEffect = Effect.fn("Jobs.command")(
  function* (args: readonly string[], context: JobsCommandContext) {
    return yield* Effect.gen(function* () {
      const parsed = yield* cliTry("jobs.args", () => parse(args));
      const jobs = yield* CliJobs;
      if (parsed.path[0] === "list") {
        const manifest = yield* jobs.manifest(parsed.projectRoot);
        if (manifest !== undefined && parsed.options.service === undefined) {
          context.reporter.output(
            { command: "jobs list", items: manifest.jobs ?? [] },
            "Jobs listed.",
          );
          return CLI_EXIT_CODES.success;
        }
        return yield* reportRequest(parsed, context, "GET", "/jobs/definitions");
      }
      if (parsed.path[0] === "capabilities")
        return yield* reportRequest(
          parsed,
          context,
          "GET",
          parsed.options.service === undefined
            ? "/jobs/services"
            : "/jobs/services/" +
                (yield* cliTry("jobs.locator", () => encode(parsed.options.service))),
        );
      if (parsed.path[0] === "runs") {
        if (parsed.path[1] === "list")
          return yield* reportRequest(parsed, context, "GET", "/jobs/runs");
        if (parsed.path[1] === "get")
          return yield* reportRequest(
            parsed,
            context,
            "GET",
            "/jobs/runs/" + (yield* cliTry("jobs.locator", () => encode(parsed.options["run-id"]))),
          );
        if (parsed.path[1] === "watch") {
          yield* jobs.watch(parsed, context);
          return CLI_EXIT_CODES.success;
        }
      }
      if (parsed.path[0] === "cancel" || parsed.path[0] === "retry") {
        yield* cliTry("jobs.mutation-options", () => {
          requireOption(parsed, "run-id");
          requireOption(parsed, "operation-id");
        });
        return yield* reportRequest(
          parsed,
          context,
          "POST",
          `/jobs/runs/${encode(parsed.options["run-id"])}/${parsed.path[0]}`,
        );
      }
      if (parsed.path[0] === "trigger") {
        const value = yield* jobs.trigger(parsed, context.signal);
        context.reporter.output(value, "Job triggered.");
        return CLI_EXIT_CODES.success;
      }
      if (parsed.path[0] === "schedules") return yield* scheduleEffect(parsed, context);
      return yield* Effect.fail(usage("Usage: relkit jobs <command>"));
    }).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.sync(() => reportJobsFailure(cliOriginalError(Cause.squash(cause)), context)),
      ),
    );
  },
  (effect) => observeCli("jobs.command", effect),
);

/**
 * Retains existing schedule validation and sends one declared mutation/read.
 * @param parsed - Existing schedule arguments.
 * @param context - Existing reporter and caller cancellation.
 * @returns Lazy unchanged status requiring the jobs domain.
 */
const scheduleEffect = Effect.fn("Jobs.schedule-command")(function* (
  parsed: ParsedJobs,
  context: JobsCommandContext,
) {
  const action = parsed.path[1];
  if (action === "list") return yield* reportRequest(parsed, context, "GET", "/jobs/schedules");
  yield* cliTry("jobs.schedule-options", () => {
    requireOption(parsed, "schedule-id", action !== "upsert");
    if (action === "upsert") requireOption(parsed, "definition-file");
    if (action !== "list" && action !== "get") requireOption(parsed, "operation-id");
  });
  if (action === "get")
    return yield* reportRequest(
      parsed,
      context,
      "GET",
      `/jobs/schedules/${encode(parsed.options["schedule-id"])}`,
    );
  const jobs = yield* CliJobs;
  const body =
    action === "upsert"
      ? { definition: yield* jobs.jsonFile(parsed.projectRoot, parsed.options["definition-file"]!) }
      : undefined;
  return yield* reportRequest(
    parsed,
    context,
    action === "delete" ? "DELETE" : "POST",
    action === "upsert"
      ? "/jobs/schedules"
      : `/jobs/schedules/${encode(parsed.options["schedule-id"])}/${action}`,
    { body },
  );
});

/**
 * Emits one REST result through the unchanged presentation policy.
 * @param parsed - Existing normalized query.
 * @param context - Reporter and cancellation.
 * @param method - Declared REST method.
 * @param path - Encoded selected path.
 * @param options - Optional original body.
 * @returns Lazy established success status.
 */
const reportRequest = Effect.fn("Jobs.report-request")(function* (
  parsed: ParsedJobs,
  context: JobsCommandContext,
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: JobsRequestOptions = {},
) {
  const jobs = yield* CliJobs;
  const value = yield* jobs.request(parsed, method, path, { ...options, signal: context.signal });
  context.reporter.output(value, `${parsed.path.join(" ")} complete.`);
  return CLI_EXIT_CODES.success;
});

/**
 * Applies the existing terminal public jobs failure policy.
 * @param error - Original failure restored from adapter cause.
 * @param context - Existing public reporter.
 * @returns Existing usage or failure exit status.
 */
function reportJobsFailure(error: unknown, context: JobsCommandContext): number {
  const code = error instanceof JobsCommandError ? error.code : "RELKIT_JOBS_FAILED";
  context.reporter.error(code, error instanceof Error ? error.message : String(error));
  return code === "RELKIT_JOBS_USAGE" ? CLI_EXIT_CODES.usage : CLI_EXIT_CODES.failure;
}
