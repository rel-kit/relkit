/**
 * One declared prompt choice with a label and optional explanatory hint.
 * @typeParam Value - Union of declared choice values.
 */
export interface PromptOption<Value extends string = string> {
  readonly value: Value;
  readonly label: string;
  readonly hint?: string;
}

/**
 * Text question with optional initial input and native validation callback.
 */
export interface TextPromptOptions {
  readonly message: string;
  readonly placeholder?: string;
  readonly initialValue?: string;
  /**
   * Returns a user-facing validation message for unacceptable native text input.
   * @param value - Current native text input, possibly undefined.
   * @returns A rejection message/Error, or undefined when the text is acceptable.
   */
  readonly validate?: (value: string | undefined) => string | Error | undefined;
}

/**
 * Question and finite choices accepted by a prompt adapter.
 * @typeParam Value - Union of declared choice values.
 */
export interface ChoicePromptOptions<Value extends string> {
  readonly message: string;
  readonly options: readonly PromptOption<Value>[];
  readonly initialValue?: Value;
}

/**
 * Clack-compatible native questions and progress output, with optional caller cancellation.
 */
export interface PromptDriver {
  /**
   * Asks for text through the explicit, cancellation-aware native driver.
   * @param options - Explicit options retaining existing defaults.
   * @param signal - Optional caller cancellation signal.
   * @returns Decoded text; prompt interruption propagates to the native driver.
   */
  readonly text: (options: TextPromptOptions, signal?: AbortSignal) => Promise<string>;
  /**
   * Asks the native driver for one declared choice.
   * @typeParam Value - Union of declared native choice values.
   * @param options - Question, declared choices and optional initial selection.
   * @param signal - Optional caller cancellation signal.
   * @returns A Promise for the native choice; cancellation rejects with the configured public code.
   */
  readonly select: <Value extends string>(
    options: ChoicePromptOptions<Value>,
    signal?: AbortSignal,
  ) => Promise<Value>;
  /**
   * Asks the native driver for declared choices in selection order.
   * @typeParam Value - Union of declared native choice values.
   * @param options - Question, declared choices and optional required-selection policy.
   * @param signal - Optional caller cancellation signal.
   * @returns A Promise for selected native choices; cancellation rejects with the configured public code.
   */
  readonly multiselect: <Value extends string>(
    options: ChoicePromptOptions<Value> & { readonly required?: boolean },
    signal?: AbortSignal,
  ) => Promise<readonly Value[]>;
  /**
   * Asks for boolean consent and decodes the native answer.
   * @param options - Explicit options retaining existing defaults.
   * @param signal - Optional caller cancellation signal.
   * @returns Decoded consent; cancellation retains its original rejection.
   */
  readonly confirm: (
    options: {
      readonly message: string;
      readonly initialValue?: boolean;
    },
    signal?: AbortSignal,
  ) => Promise<boolean>;
  /**
   * Presents an existing explanatory note through the terminal adapter.
   * @param message - Existing user-facing diagnostic.
   * @param title - Title displayed by the native progress/prompt sink.
   * @returns Completion after the existing contract has been applied.
   */
  readonly note: (message: string, title?: string) => void;
  /**
   * Presents the existing flow introduction through the terminal adapter.
   * @param title - Title displayed by the native progress/prompt sink.
   * @returns Completion after the existing contract has been applied.
   */
  readonly intro: (title: string) => void;
  /**
   * Presents the existing flow completion through the terminal adapter.
   * @param message - Existing user-facing diagnostic.
   * @returns Completion after the existing contract has been applied.
   */
  readonly outro: (message: string) => void;
}
