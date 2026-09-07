import * as prompts from "@clack/prompts";

export interface PromptOption<Value extends string = string> {
  readonly value: Value;
  readonly label: string;
  readonly hint?: string;
}

export interface TextPromptOptions {
  readonly message: string;
  readonly placeholder?: string;
  readonly initialValue?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
}

export interface ChoicePromptOptions<Value extends string> {
  readonly message: string;
  readonly options: readonly PromptOption<Value>[];
  readonly initialValue?: Value;
}

export interface PromptDriver {
  readonly text: (options: TextPromptOptions) => Promise<string>;
  readonly select: <Value extends string>(options: ChoicePromptOptions<Value>) => Promise<Value>;
  readonly multiselect: <Value extends string>(
    options: ChoicePromptOptions<Value> & { readonly required?: boolean },
  ) => Promise<readonly Value[]>;
  readonly confirm: (options: {
    readonly message: string;
    readonly initialValue?: boolean;
  }) => Promise<boolean>;
  readonly note: (message: string, title?: string) => void;
  readonly intro: (title: string) => void;
  readonly outro: (message: string) => void;
}

export function createClackPromptDriver(cancellationCode = "RELKIT_ADD_CANCELLED"): PromptDriver {
  const select = async <Value extends string>(
    options: ChoicePromptOptions<Value>,
  ): Promise<Value> =>
    answer(
      await prompts.select({
        message: options.message,
        options: options.options.map(promptOption) as Parameters<
          typeof prompts.select<Value>
        >[0]["options"],
        ...(options.initialValue === undefined ? {} : { initialValue: options.initialValue }),
      }),
      cancellationCode,
    );
  const multiselect = async <Value extends string>(
    options: ChoicePromptOptions<Value> & { readonly required?: boolean },
  ): Promise<readonly Value[]> =>
    answer(
      await prompts.multiselect({
        message: options.message,
        options: options.options.map(promptOption) as Parameters<
          typeof prompts.multiselect<Value>
        >[0]["options"],
        ...(options.initialValue === undefined ? {} : { initialValue: options.initialValue }),
        ...(options.required === undefined ? {} : { required: options.required }),
      }),
      cancellationCode,
    );
  return {
    text: async (options) =>
      answer(
        await prompts.text({
          message: options.message,
          ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
          ...(options.initialValue === undefined ? {} : { initialValue: options.initialValue }),
          ...(options.validate === undefined ? {} : { validate: options.validate }),
        }),
        cancellationCode,
      ),
    select,
    multiselect,
    confirm: async (options) => answer(await prompts.confirm(options), cancellationCode),
    note: (message, title) => prompts.note(message, title),
    intro: (title) => prompts.intro(title),
    outro: (message) => prompts.outro(message),
  };
}

function promptOption<Value extends string>(option: PromptOption<Value>) {
  return {
    value: option.value,
    label: option.label,
    ...(option.hint === undefined ? {} : { hint: option.hint }),
  };
}

function answer<Value>(value: Value | symbol, code: string): Value {
  if (!prompts.isCancel(value)) return value;
  prompts.cancel("Cancelled.");
  throw Object.assign(new Error("Scaffolding was cancelled."), { code, exitCode: 130 });
}
