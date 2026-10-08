import type { PromptDriver } from "create-relkit";
import type { ScaffoldStatus } from "./cli-interaction.types.js";
import type { CliCommandContext, CliRuntime } from "./main-support.js";

/**
 * Displays a plan using the existing human-only presentation policy.
 * @param text - Formatted generator plan.
 * @param title - Existing note title.
 * @param context - Invocation presentation policy.
 * @param prompt - Optional interactive driver.
 * @returns Nothing.
 */
export function showScaffoldPlan(
  text: string,
  title: string,
  context: CliCommandContext,
  prompt?: PromptDriver,
): void {
  if (context.json) return;
  if (prompt) prompt.note(text, title);
  else context.io?.stderr(text);
}

/**
 * Creates the synchronous progress adapter for an owned spinner.
 * @param status - Invocation-owned spinner facade.
 * @param runtime - Existing explicit-I/O injection.
 * @param context - Invocation presentation policy.
 * @returns A native callback with the existing progress filtering.
 */
export function scaffoldProgress(
  status: ScaffoldStatus,
  runtime: CliRuntime,
  context: CliCommandContext,
): (message: string) => void {
  return (message) => {
    if (runtime.io) context.io?.stderr(message);
    else if (!message.startsWith("Creating a new RELKIT app")) status.message(message);
  };
}
