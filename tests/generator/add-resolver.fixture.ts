/** Shares the original deterministic fixture constants and helpers across cohesive add-resolver cases. */
import { resolve } from "node:path";
import { type PromptDriver } from "../../packages/cli/src/scaffolding/index.ts";
export const templates = resolve(import.meta.dir, "../../templates/default/v1");

export function driver(answers: {
  readonly select?: Readonly<Record<string, string>>;
  readonly text?: Readonly<Record<string, string>>;
  readonly confirm?: Readonly<Record<string, boolean>>;
}): PromptDriver {
  return {
    text: async (options) => answers.text?.[options.message] ?? options.initialValue ?? "value",
    select: async (options) =>
      (answers.select?.[options.message] ??
        options.initialValue ??
        options.options[0]!.value) as never,
    multiselect: async () => [],
    confirm: async (options) => answers.confirm?.[options.message] ?? options.initialValue ?? true,
    note: () => undefined,
    intro: () => undefined,
    outro: () => undefined,
  };
}
