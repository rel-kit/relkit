export interface CliHelpOption {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly type: "boolean" | "string" | "integer" | "choice" | "key=value";
  readonly description: string;
  readonly values?: readonly string[];
}

export interface CliHelpArgument {
  readonly name: string;
  readonly required: boolean;
  readonly description: string;
}

export interface CliHelpCommand {
  readonly name: string;
  readonly description: string;
  readonly usage: string;
  readonly examples: readonly { readonly command: string; readonly description: string }[];
  readonly options: readonly CliHelpOption[];
  readonly arguments: readonly CliHelpArgument[];
  readonly commands: readonly CliHelpCommand[];
}

export interface CliHelpModel extends CliHelpCommand {
  readonly version: string;
}
