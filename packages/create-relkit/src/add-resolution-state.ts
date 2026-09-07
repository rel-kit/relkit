import { normalizeArtifactName } from "./add-name.js";
import { parseAddArguments, type ParsedAddArguments } from "./add-options-parser.js";
import type { PromptDriver, PromptOption } from "./prompt-driver.js";

export class AddResolutionState {
  readonly args: string[];
  prompted = false;

  constructor(
    args: readonly string[],
    readonly cwd: string | undefined,
    readonly interactive: boolean,
    readonly prompt: PromptDriver | undefined,
  ) {
    this.args = [...args];
  }

  get parsed(): ParsedAddArguments {
    return parseAddArguments(this.args, this.cwd);
  }

  has(name: string): boolean {
    return this.parsed.values.has(name) || this.parsed.flags.has(name);
  }

  option(name: string, value: string): void {
    if (!this.has(name)) this.args.push(`--${name}`, value);
  }

  repeated(name: string, values: readonly string[]): void {
    if (!this.has(name)) for (const value of values) this.args.push(`--${name}`, value);
  }

  flag(name: string): void {
    if (!this.has(name)) this.args.push(`--${name}`);
  }

  positional(value: string): void {
    if (!this.parsed.positional) this.args.push(value);
  }

  async text(
    message: string,
    initialValue?: string,
    artifact = false,
  ): Promise<string | undefined> {
    if (!this.interactive || !this.prompt) return undefined;
    this.prompted = true;
    return this.prompt.text({
      message,
      ...(initialValue === undefined ? {} : { initialValue }),
      validate: (value) => {
        if (!value?.trim()) return "A value is required.";
        if (!artifact) return undefined;
        try {
          normalizeArtifactName(value);
          return undefined;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
    });
  }

  async select<Value extends string>(
    message: string,
    options: readonly PromptOption<Value>[],
    initialValue?: Value,
  ): Promise<Value | undefined> {
    if (!this.interactive || !this.prompt) return undefined;
    this.prompted = true;
    return this.prompt.select({
      message,
      options,
      ...(initialValue === undefined ? {} : { initialValue }),
    });
  }

  async multiselect<Value extends string>(
    message: string,
    options: readonly PromptOption<Value>[],
    required = false,
  ): Promise<readonly Value[] | undefined> {
    if (!this.interactive || !this.prompt) return undefined;
    this.prompted = true;
    return this.prompt.multiselect({ message, options, required });
  }

  async confirm(message: string, initialValue = true): Promise<boolean | undefined> {
    if (!this.interactive || !this.prompt) return undefined;
    this.prompted = true;
    return this.prompt.confirm({ message, initialValue });
  }
}

export function choices<const Value extends string>(
  values: readonly Value[],
): PromptOption<Value>[] {
  return values.map((value) => ({ value, label: label(value) }));
}

export function label(value: string): string {
  return value.replaceAll("-", " ").replace(/^./, (character) => character.toUpperCase());
}
