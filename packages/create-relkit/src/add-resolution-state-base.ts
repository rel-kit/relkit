import { Effect, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";

import { parseAddArguments, type ParsedAddArguments } from "./add-options-parser.js";

import { runGeneratorSync } from "./generator-runtime.js";
import type { PromptDriver } from "./prompt-driver.types.js";
import type { AddResolutionSnapshot } from "./add-resolution-state.types.js";

import { addResolutionPrompt } from "./add-resolution-prompt.js";

/** Private Ref owner for finite argument resolution and prompt capabilities. */
export class AddResolutionStateBase {
  readonly #prompts: ReturnType<typeof addResolutionPrompt>;
  readonly #state: Ref.Ref<AddResolutionSnapshot>;

  /**
   * Constructs one request owner; synchronous construction preserves its existing API.
   * @param args - Literal flag and positional arguments.
   * @param cwd - Working directory for the operation.
   * @param interactive - Whether this request may ask for missing choices.
   * @param prompt - Optional existing native prompt driver.
   * @returns The request owner with one private Ref and its prompt capabilities.
   */
  constructor(
    args: readonly string[],
    readonly cwd: string | undefined,
    readonly interactive: boolean,
    readonly prompt: PromptDriver | undefined,
  ) {
    this.#state = Ref.makeUnsafe<AddResolutionSnapshot>({ args: [...args], prompted: false });
    this.#prompts = addResolutionPrompt(this.#state, interactive);
  }

  /**
   * Returns a copy of resolved arguments without exposing state mutation authority.
   * @returns A copy of current argument tokens; authoritative Ref state remains private.
   */
  get args(): string[] {
    return [...Ref.getUnsafe(this.#state).args];
  }

  /**
   * Reads the existing prompted flag from its request Ref.
   * @returns Whether the existing contract matches.
   */
  get prompted(): boolean {
    return Ref.getUnsafe(this.#state).prompted;
  }

  /**
   * Preserves synchronous prompted updates through the authoritative Ref.
   * @param value - Whether this request has asked for interactive input.
   * @returns Completion after the request's prompt-consent flag is updated.
   */
  set prompted(value: boolean) {
    runGeneratorSync(Ref.update(this.#state, (state) => ({ ...state, prompted: value })));
  }

  /**
   * Parses only the current request snapshot; parsing remains a pure validation leaf.
   * @returns A fresh parsed projection of the current request arguments.
   */
  get parsed(): ParsedAddArguments {
    return parseAddArguments(this.args, this.cwd);
  }

  /**
   * Checks whether an explicit option already owns this decision.
   * @param name - Authored name or declaration key.
   * @returns Whether the existing contract matches.
   */
  has(name: string): boolean {
    return this.parsed.values.has(name) || this.parsed.flags.has(name);
  }

  /**
   * Appends explicit argument tokens in one atomic state update.
   * @param values - Ordered declarations or argument values.
   * @returns Completion after argument tokens are appended in one atomic request-state update.
   */
  readonly appendEffect = Effect.fn("AddResolution.append")((...values: readonly string[]) =>
    observeExecution(
      "generator",
      "add.resolve.append",
      Ref.update(this.#state, (state) => ({ ...state, args: [...state.args, ...values] })),
    ),
  );

  /**
   * Records an omitted option without replacing an explicit choice.
   * @param name - Authored name or declaration key.
   * @param value - Resolved flag value to append only when the flag is absent.
   * @returns Completion after the absent flag/value is recorded, leaving explicit values unchanged.
   */
  readonly optionEffect = Effect.fn("AddResolution.option")(
    (name: string, value: string) =>
      Effect.suspend(() => (this.has(name) ? Effect.void : this.appendEffect(`--${name}`, value))),
    (effect) => observeExecution("generator", "add.resolve.option", effect),
  );

  /**
   * Records repeated values as one request-state transition.
   * @param name - Authored name or declaration key.
   * @param values - Ordered declarations or argument values.
   * @returns Completion after absent repeated flag values are recorded in order.
   */
  readonly repeatedEffect = Effect.fn("AddResolution.repeated")(
    (name: string, values: readonly string[]) =>
      Effect.suspend(() =>
        this.has(name)
          ? Effect.void
          : this.appendEffect(...values.flatMap((value) => [`--${name}`, value])),
      ),
    (effect) => observeExecution("generator", "add.resolve.repeated", effect),
  );

  /**
   * Records an omitted flag without replacing an explicit choice.
   * @param name - Authored name or declaration key.
   * @returns Completion after the absent boolean flag is recorded.
   */
  readonly flagEffect = Effect.fn("AddResolution.flag")(
    (name: string) =>
      Effect.suspend(() => (this.has(name) ? Effect.void : this.appendEffect(`--${name}`))),
    (effect) => observeExecution("generator", "add.resolve.flag", effect),
  );

  /**
   * Records a missing positional artifact identity.
   * @param value - Artifact name or route path to append only when absent.
   * @returns Completion after a missing artifact name/path is recorded.
   */
  readonly positionalEffect = Effect.fn("AddResolution.positional")(
    (value: string) =>
      Effect.suspend(() => (this.parsed.positional ? Effect.void : this.appendEffect(value))),
    (effect) => observeExecution("generator", "add.resolve.positional", effect),
  );
  /**
   * Asks text through explicit prompt authority only for an interactive request.
   * @param message - Existing user-facing diagnostic.
   * @param initialValue - Initial native prompt answer or declared default.
   * @param artifact - Whether entered text must pass artifact-name validation.
   * @returns Entered text, or undefined when the request is headless; invalid answers fail.
   */
  get textEffect() {
    return this.#prompts.textEffect;
  }

  /**
   * Asks a finite choice through explicit prompt authority.
   * @typeParam Value - Union of declared prompt option values.
   * @param message - Question displayed by the prompt driver.
   * @param options - Finite choices offered to the user.
   * @param initialValue - Declared choice initially selected by the driver.
   * @returns An observed prompt Effect returning a declared value, or undefined when headless.
   */
  get selectEffect() {
    return this.#prompts.selectEffect;
  }

  /**
   * Asks multiple finite choices through explicit prompt authority.
   * @typeParam Value - Union of declared prompt option values.
   * @param message - Question displayed by the prompt driver.
   * @param options - Finite choices offered to the user.
   * @param required - Whether the selection must contain at least one value.
   * @returns An observed prompt Effect returning selected declared values, or undefined when headless.
   */
  get multiselectEffect() {
    return this.#prompts.multiselectEffect;
  }

  /**
   * Asks consent through explicit prompt authority.
   * @param message - Existing user-facing diagnostic.
   * @param initialValue - Initial native prompt answer or declared default.
   * @returns The consent answer, or undefined when the request is headless.
   */
  get confirmEffect() {
    return this.#prompts.confirmEffect;
  }
}
