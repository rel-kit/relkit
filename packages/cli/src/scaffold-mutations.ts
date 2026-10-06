import { Effect } from "effect";
import { observeCli } from "./cli-runtime.js";
import {
  createClackPromptDriver,
  formatAddResult,
  formatGenerateResult,
  formatScaffoldPlan,
} from "create-relkit";
import { CliGenerator } from "./services/generator.service.js";
import { CliInteraction } from "./cli-interaction.service.js";
import { cliAdapterError, cliOriginalError } from "./cli-errors.js";
import { createScaffoldStatusEffect } from "./cli-status.js";
import { finishScaffoldLocalEffect } from "./scaffold-local.js";
import { showScaffoldPlan, scaffoldProgress } from "./scaffold-presentation.js";
import {
  CLI_EXIT_CODES,
  errorMessage,
  fail,
  type CliCommandContext,
  type CliRuntime,
} from "./main-support.js";

/**
 * Composes name resolution and the generator-owned creation transaction.
 * @param args - Original creation flags.
 * @param context - Invocation presentation and cancellation policy.
 * @param runtime - Existing I/O injection.
 * @returns Lazy exit status; the generator owns exactly one final consent.
 */
export const executeCreateEffect = Effect.fn("Scaffold.create")(
  function* (args: readonly string[], context: CliCommandContext, runtime: CliRuntime) {
    const generator = yield* CliGenerator;
    const interactive = context.tty === true && context.ci !== true && !context.json;
    const prompt = interactive
      ? (context.promptDriver ?? createClackPromptDriver("RELKIT_CREATE_CANCELLED"))
      : undefined;
    const resolved = yield* generator
      .resolveCreate(args, {
        json: context.json,
        interactive,
        signal: context.signal,
        ...(prompt ? { promptDriver: prompt } : {}),
      })
      .pipe(
        Effect.mapError((wrapped) => {
          const error = cliOriginalError(wrapped);
          if (error instanceof Error && "code" in error) {
            return error.code === "RELKIT_CREATE_USAGE"
              ? cliAdapterError(
                  "create.resolve",
                  fail(error.code, error.message, CLI_EXIT_CODES.usage),
                )
              : wrapped;
          }
          return cliAdapterError(
            "create.resolve",
            fail("RELKIT_CLI_USAGE", errorMessage(error), CLI_EXIT_CODES.usage),
          );
        }),
      );
    const status = yield* createScaffoldStatusEffect(
      runtime,
      context.json,
      "Project creation failed.",
    );
    const result = yield* generator.generate(resolved.options, {
      ...context,
      interactive,
      ...(prompt ? { promptDriver: prompt } : {}),
      ...(context.json ? {} : { onProgress: scaffoldProgress(status, runtime, context) }),
    });
    status.finish(true, "Project created.");
    if (result !== undefined) context.reporter.output(result, formatGenerateResult(result));
    return CLI_EXIT_CODES.success;
  },
  (effect) => observeCli("scaffold.create", effect),
);

/**
 * Composes add planning, explicit consent, owned mutation and separate Docker consent.
 * @param args - Original add arguments.
 * @param context - Invocation presentation and cancellation policy.
 * @param runtime - Existing I/O injection.
 * @returns Lazy exit status after mutation cleanup and optional local startup.
 */
export const executeAddEffect = Effect.fn("Scaffold.add")(
  function* (args: readonly string[], context: CliCommandContext, runtime: CliRuntime) {
    const generator = yield* CliGenerator;
    const interactive = context.tty === true && context.ci !== true && !context.json;
    const prompt = interactive ? (context.promptDriver ?? createClackPromptDriver()) : undefined;
    const resolved = yield* generator.resolveAdd(args, {
      interactive,
      signal: context.signal,
      ...(context.cwd ? { cwd: context.cwd } : {}),
      ...(prompt ? { promptDriver: prompt } : {}),
    });
    const plan = yield* generator.planAdd(resolved.request);
    showScaffoldPlan(formatScaffoldPlan(plan), "Planned changes", context, prompt);
    if (resolved.prompted && prompt) {
      const interaction = yield* CliInteraction;
      if (
        !(yield* interaction.confirm(
          prompt,
          { message: "Apply these changes?", initialValue: true },
          context.signal,
        ))
      ) {
        return yield* Effect.fail(
          cliAdapterError(
            "add.consent",
            fail("RELKIT_ADD_CANCELLED", "Scaffolding was cancelled.", CLI_EXIT_CODES.sigint),
          ),
        );
      }
    }
    const status = yield* createScaffoldStatusEffect(runtime, context.json, "Scaffolding failed.");
    status.start("Applying scaffold...");
    const result = yield* generator.applyAdd(plan, {
      signal: context.signal,
      ...(context.json ? {} : { onProgress: scaffoldProgress(status, runtime, context) }),
    });
    status.finish(true, "Scaffold applied.");
    const completed = yield* finishScaffoldLocalEffect(result, context, prompt);
    context.reporter.output(completed.result, formatAddResult(completed.result));
    return completed.exitCode;
  },
  (effect) => observeCli("scaffold.add", effect),
);
