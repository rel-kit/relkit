import { spinner } from "@clack/prompts";
import {
  createClackPromptDriver,
  formatAddResult,
  formatCreatePlan,
  formatGenerateResult,
  formatScaffoldPlan,
  type AddResult,
} from "create-relkit";
import type { CliInvocation } from "./cli-effect-runtime.js";
import { finishScaffoldLocal } from "./scaffold-local.js";
import {
  CLI_EXIT_CODES,
  errorMessage,
  fail,
  isGeneratorApi,
  loadCreateRelkit,
  type CliCommandContext,
  type CliRuntime,
  type CreateRelkitGeneratorApi,
} from "./main-support.js";

export async function executeScaffoldCommand(
  invocation: CliInvocation,
  context: CliCommandContext,
  runtime: CliRuntime,
): Promise<number | undefined> {
  if (invocation.command !== "create" && invocation.command !== "add") return undefined;
  const api = await (runtime.loadCreateRelkit ?? loadCreateRelkit)();
  if (!isGeneratorApi(api))
    throw fail("RELKIT_CREATE_API_UNAVAILABLE", "The create-relkit generator API is unavailable.");
  return invocation.command === "create"
    ? executeCreate(api, invocation.args, context, runtime)
    : executeAdd(api, invocation.args, context, runtime);
}

async function executeCreate(
  api: CreateRelkitGeneratorApi,
  args: readonly string[],
  context: CliCommandContext,
  runtime: CliRuntime,
): Promise<number> {
  const interactive = context.tty === true && context.ci !== true && !context.json;
  const prompt = interactive
    ? (context.promptDriver ?? createClackPromptDriver("RELKIT_CREATE_CANCELLED"))
    : undefined;
  let resolved: { readonly options: unknown; readonly prompted: boolean };
  try {
    resolved = api.resolveCreateOptionsDetails
      ? await api.resolveCreateOptionsDetails(args, {
          json: context.json,
          interactive,
          ...(prompt ? { promptDriver: prompt } : {}),
        })
      : { options: api.normalizeCreateOptions(args, { json: context.json }), prompted: false };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "RELKIT_CREATE_USAGE") {
      throw fail(error.code, error.message, CLI_EXIT_CODES.usage);
    }
    if (error instanceof Error && "code" in error) throw error;
    throw fail("RELKIT_CLI_USAGE", errorMessage(error), CLI_EXIT_CODES.usage);
  }
  if (api.planCreate) {
    const plan = await api.planCreate(resolved.options, context.cwd ? { cwd: context.cwd } : {});
    showPlan(formatCreatePlan(plan), "Planned project", context, prompt);
  }
  if (
    resolved.prompted &&
    prompt &&
    !(await prompt.confirm({ message: "Create this project?", initialValue: true }))
  ) {
    throw fail("RELKIT_CREATE_CANCELLED", "Scaffolding was cancelled.", CLI_EXIT_CODES.sigint);
  }
  const status = mutationStatus(runtime, context.json);
  try {
    const result = await api.generateProject(resolved.options, {
      ...context,
      interactive,
      ...(prompt ? { promptDriver: prompt } : {}),
      ...(context.json ? {} : { onProgress: progress(status, runtime, context) }),
    });
    status.finish(true, "Project created.");
    if (result !== undefined) context.reporter.output(result, formatGenerateResult(result));
    return CLI_EXIT_CODES.success;
  } catch (error) {
    status.finish(false, "Project creation failed.");
    throw error;
  }
}

async function executeAdd(
  api: CreateRelkitGeneratorApi,
  args: readonly string[],
  context: CliCommandContext,
  runtime: CliRuntime,
): Promise<number> {
  if (!api.resolveAddRequestDetails || !api.planAdd || !api.applyScaffoldPlan) {
    throw fail("RELKIT_ADD_API_UNAVAILABLE", "The create-relkit add API is unavailable.");
  }
  const interactive = context.tty === true && context.ci !== true && !context.json;
  const prompt = interactive ? (context.promptDriver ?? createClackPromptDriver()) : undefined;
  const resolved = await api.resolveAddRequestDetails(args, {
    interactive,
    ...(context.cwd ? { cwd: context.cwd } : {}),
    ...(prompt ? { promptDriver: prompt } : {}),
  });
  const plan = await api.planAdd(resolved.request);
  showPlan(formatScaffoldPlan(plan), "Planned changes", context, prompt);
  if (
    resolved.prompted &&
    prompt &&
    !(await prompt.confirm({ message: "Apply these changes?", initialValue: true }))
  ) {
    throw fail("RELKIT_ADD_CANCELLED", "Scaffolding was cancelled.", CLI_EXIT_CODES.sigint);
  }
  const status = mutationStatus(runtime, context.json);
  status.start("Applying scaffold...");
  let result: AddResult;
  try {
    result = await api.applyScaffoldPlan(plan, {
      signal: context.signal,
      ...(context.json ? {} : { onProgress: progress(status, runtime, context) }),
    });
    status.finish(true, "Scaffold applied.");
  } catch (error) {
    status.finish(false, "Scaffolding failed.");
    throw error;
  }
  const completed = await finishScaffoldLocal(result, context, prompt);
  context.reporter.output(completed.result, formatAddResult(completed.result));
  return completed.exitCode;
}

function showPlan(
  text: string,
  title: string,
  context: CliCommandContext,
  prompt: CliCommandContext["promptDriver"],
): void {
  if (context.json) return;
  if (prompt) prompt.note(text, title);
  else context.io?.stderr(text);
}

function progress(
  status: ReturnType<typeof mutationStatus>,
  runtime: CliRuntime,
  context: CliCommandContext,
) {
  return (message: string) => {
    if (runtime.io) context.io?.stderr(message);
    else if (!message.startsWith("Creating a new RELKIT app")) status.message(message);
  };
}

function mutationStatus(runtime: CliRuntime, json: boolean) {
  const enabled =
    !json &&
    runtime.io === undefined &&
    !(runtime.ci ?? Boolean(process.env.CI)) &&
    (runtime.tty ?? process.stderr.isTTY) === true;
  const value = enabled ? spinner() : undefined;
  let started = false;
  return {
    start: (message: string) => {
      if (value && !started) {
        value.start(message);
        started = true;
      }
    },
    message: (message: string) => {
      if (value) {
        if (!started) {
          value.start(message);
          started = true;
        } else value.message(message);
      }
    },
    finish: (ok: boolean, message: string) => {
      if (value && started) ok ? value.stop(message) : value.error(message);
    },
  };
}
