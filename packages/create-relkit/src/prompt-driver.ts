import * as prompts from "@clack/prompts";
import type { ChoicePromptOptions, PromptDriver, PromptOption } from "./prompt-driver.types.js";
export type {
  ChoicePromptOptions,
  PromptDriver,
  PromptOption,
  TextPromptOptions,
} from "./prompt-driver.types.js";

/**
 * Creates the public Clack adapter, forwarding fiber-owned cancellation to native prompts.
 * @param cancellationCode - Existing create/add cancellation code.
 * @returns The unchanged public prompt driver with optional cancellation forwarding.
 */
export function createClackPromptDriver(cancellationCode = "RELKIT_ADD_CANCELLED"): PromptDriver {
  const select = async <Value extends string>(
    options: ChoicePromptOptions<Value>,
    signal?: AbortSignal,
  ): Promise<Value> =>
    answer(
      await prompts.select({
        message: options.message,
        ...(signal === undefined ? {} : { signal }),
        options: options.options.map(promptOption) as Parameters<
          typeof prompts.select<Value>
        >[0]["options"],
        ...(options.initialValue === undefined ? {} : { initialValue: options.initialValue }),
      }),
      cancellationCode,
    );
  const multiselect = async <Value extends string>(
    options: ChoicePromptOptions<Value> & { readonly required?: boolean },
    signal?: AbortSignal,
  ): Promise<readonly Value[]> =>
    answer(
      await prompts.multiselect({
        message: options.message,
        ...(signal === undefined ? {} : { signal }),
        options: options.options.map(promptOption) as Parameters<
          typeof prompts.multiselect<Value>
        >[0]["options"],
        ...(options.initialValue === undefined ? {} : { initialValue: options.initialValue }),
        ...(options.required === undefined ? {} : { required: options.required }),
      }),
      cancellationCode,
    );
  return {
    text: async (options, signal) =>
      answer(
        await prompts.text({
          message: options.message,
          ...(signal === undefined ? {} : { signal }),
          ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
          ...(options.initialValue === undefined ? {} : { initialValue: options.initialValue }),
          ...(options.validate === undefined ? {} : { validate: options.validate }),
        }),
        cancellationCode,
      ),
    select,
    multiselect,
    confirm: async (options, signal) =>
      answer(
        await prompts.confirm({ ...options, ...(signal === undefined ? {} : { signal }) }),
        cancellationCode,
      ),
    note: (message, title) => prompts.note(message, title),
    intro: (title) => prompts.intro(title),
    outro: (message) => prompts.outro(message),
  };
}

/**
 * Projects a declared choice into Clack's native option shape.
 * @typeParam Value - Literal choice value type.
 * @param option - Public declared choice.
 * @returns The choice's value, label and optional hint.
 */
function promptOption<Value extends string>(option: PromptOption<Value>) {
  return {
    value: option.value,
    label: option.label,
    ...(option.hint === undefined ? {} : { hint: option.hint }),
  };
}

/**
 * Rejects Clack's cancellation sentinel while retaining ordinary answers.
 * @typeParam Value - Native non-cancelled answer type.
 * @param value - Native answer or Clack cancellation sentinel.
 * @param code - Public cancellation code selected by the adapter.
 * @returns The native answer; cancellation throws the configured public code with exit status 130.
 */
function answer<Value>(value: Value | symbol, code: string): Value {
  if (!prompts.isCancel(value)) return value;
  prompts.cancel("Cancelled.");
  throw Object.assign(new Error("Scaffolding was cancelled."), { code, exitCode: 130 });
}
