import type { CliCommandContext } from "../main-support.js";
import { CLI_EXIT_CODES } from "../main-support.js";
import {
  encode,
  JobsCommandError,
  parse,
  requireOption,
  type ParsedJobs,
  usage,
} from "./jobs-support.js";
import { fetchJobsJson, readJobsJsonFile } from "./jobs-request.js";
import { readJobsManifest } from "./jobs-manifest.js";
import { triggerJob, watchJob } from "./jobs-rpc.js";

export async function runJobs(
  args: readonly string[],
  context: Pick<CliCommandContext, "json" | "reporter" | "signal">,
): Promise<number> {
  try {
    const parsed = parse(args);
    if (parsed.path[0] === "list") return await listJobs(parsed, context);
    if (parsed.path[0] === "capabilities") return await capabilities(parsed, context);
    if (parsed.path[0] === "runs" && parsed.path[1] === "list")
      return await request(parsed, context, "GET", "/jobs/runs");
    if (parsed.path[0] === "runs" && parsed.path[1] === "get")
      return await request(
        parsed,
        context,
        "GET",
        `/jobs/runs/${encode(parsed.options["run-id"])}`,
      );
    if (parsed.path[0] === "runs" && parsed.path[1] === "watch")
      return await watch(parsed, context);
    if (parsed.path[0] === "cancel" || parsed.path[0] === "retry") {
      requireOption(parsed, "run-id");
      requireOption(parsed, "operation-id");
      return await request(
        parsed,
        context,
        "POST",
        `/jobs/runs/${encode(parsed.options["run-id"])}/${parsed.path[0]}`,
      );
    }
    if (parsed.path[0] === "trigger") return await trigger(parsed, context);
    if (parsed.path[0] === "schedules") return await schedule(parsed, context);
    throw usage("Usage: relkit jobs <command>");
  } catch (error) {
    const code = error instanceof JobsCommandError ? error.code : "RELKIT_JOBS_FAILED";
    context.reporter.error(code, error instanceof Error ? error.message : String(error));
    return error instanceof JobsCommandError && error.code === "RELKIT_JOBS_USAGE"
      ? CLI_EXIT_CODES.usage
      : CLI_EXIT_CODES.failure;
  }
}

async function listJobs(
  parsed: ParsedJobs,
  context: Pick<CliCommandContext, "reporter" | "signal">,
): Promise<number> {
  const manifest = await readJobsManifest(parsed.projectRoot);
  if (manifest !== undefined && parsed.options.service === undefined) {
    context.reporter.output({ command: "jobs list", items: manifest.jobs ?? [] }, "Jobs listed.");
    return CLI_EXIT_CODES.success;
  }
  return request(parsed, context, "GET", "/jobs/definitions");
}

async function capabilities(
  parsed: ParsedJobs,
  context: Pick<CliCommandContext, "reporter" | "signal">,
): Promise<number> {
  const service = parsed.options.service;
  return request(
    parsed,
    context,
    "GET",
    service === undefined ? "/jobs/services" : "/jobs/services/" + encode(service),
  );
}

async function trigger(
  parsed: ParsedJobs,
  context: Pick<CliCommandContext, "reporter" | "signal">,
): Promise<number> {
  requireOption(parsed, "job");
  const value = await triggerJob(parsed, context.signal);
  context.reporter.output(value, "Job triggered.");
  return CLI_EXIT_CODES.success;
}

async function schedule(
  parsed: ParsedJobs,
  context: Pick<CliCommandContext, "reporter" | "signal">,
): Promise<number> {
  const action = parsed.path[1];
  if (action === "list") return request(parsed, context, "GET", "/jobs/schedules");
  requireOption(parsed, "schedule-id", action !== "upsert");
  if (action === "upsert") requireOption(parsed, "definition-file");
  if (action !== "list" && action !== "get") requireOption(parsed, "operation-id");
  if (action === "get")
    return request(
      parsed,
      context,
      "GET",
      `/jobs/schedules/${encode(parsed.options["schedule-id"])}`,
    );
  const method = action === "delete" ? "DELETE" : "POST";
  const suffix =
    action === "upsert"
      ? "/jobs/schedules"
      : `/jobs/schedules/${encode(parsed.options["schedule-id"])}/${action}`;
  const body =
    action === "upsert"
      ? {
          definition: await readJobsJsonFile(
            parsed.projectRoot,
            parsed.options["definition-file"]!,
          ),
        }
      : undefined;
  return request(parsed, context, method, suffix, { body });
}

async function watch(
  parsed: ParsedJobs,
  context: Pick<CliCommandContext, "reporter" | "signal">,
): Promise<number> {
  await watchJob(parsed, context);
  return CLI_EXIT_CODES.success;
}

async function request(
  parsed: ParsedJobs,
  context: Pick<CliCommandContext, "reporter" | "signal">,
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: Parameters<typeof fetchJobsJson>[3] = {},
): Promise<number> {
  const value = await fetchJobsJson(parsed, method, path, { ...options, signal: context.signal });
  context.reporter.output(value, `${parsed.path.join(" ")} complete.`);
  return CLI_EXIT_CODES.success;
}
