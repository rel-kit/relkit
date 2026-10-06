import { Effect } from "effect";
import { observeCli } from "../cli-runtime.js";
import { CLI_EXIT_CODES } from "../main-support.js";
import { localUpEffect } from "./local-operations.js";
import { localStatusEffect, localStopEffect } from "./local-status-stop.js";
import { confirmLocalResetEffect } from "./local-confirmation.js";
import type {
  LocalCommandContext,
  LocalCommandDependencies,
  ParsedLocalArgs,
} from "./local.types.js";

/**
 * Composes one selected local operation, including separate reset consent.
 * @param parsed - Validated local operation flags.
 * @param context - Existing reporting and interaction policy.
 * @param dependencies - Optional public confirmation substitute.
 * @returns The established exit status after all operation-owned resources close.
 */
export const executeLocalEffect = Effect.fn("Local.execute")(
  function* (
    parsed: ParsedLocalArgs,
    context: LocalCommandContext,
    dependencies: LocalCommandDependencies,
  ) {
    if (parsed.command === "up") {
      yield* localUpEffect(
        parsed.projectRoot,
        parsed.detach,
        context,
        parsed.service,
        parsed.environment,
      );
      return CLI_EXIT_CODES.success;
    }
    if (parsed.command === "status") {
      yield* localStatusEffect(parsed.projectRoot, context, parsed.service, parsed.environment);
      return CLI_EXIT_CODES.success;
    }
    if (parsed.command === "stop") {
      yield* localStopEffect(
        parsed.projectRoot,
        false,
        context,
        false,
        parsed.service,
        parsed.environment,
      );
      return CLI_EXIT_CODES.success;
    }
    if (!parsed.yes && !parsed.dryRun) {
      const confirmed = yield* confirmLocalResetEffect(
        `Reset local containers, volumes, and state for ${parsed.projectRoot}?`,
        context,
        dependencies,
      );
      if (!confirmed) {
        yield* Effect.sync(() =>
          context.reporter.output(
            { ok: true, command: "reset", cancelled: true },
            "Reset cancelled.",
          ),
        );
        return CLI_EXIT_CODES.success;
      }
    }
    yield* localStopEffect(
      parsed.projectRoot,
      true,
      context,
      parsed.dryRun,
      parsed.service,
      parsed.environment,
    );
    return CLI_EXIT_CODES.success;
  },
  (
    effect,
    _parsed: ParsedLocalArgs,
    _context: LocalCommandContext,
    _dependencies: LocalCommandDependencies,
  ) => observeCli("local.execute", effect.pipe(Effect.scoped)),
);
