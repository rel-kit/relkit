/** One static option contract consumed by terminal and documentation renderers. */
export interface CliHelpOption {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly type: "boolean" | "string" | "integer" | "choice" | "key=value";
  readonly description: string;
  readonly values?: readonly string[];
  readonly repeatable?: boolean;
}

/** Positional argument metadata; this describes syntax without parsing input. */
export interface CliHelpArgument {
  readonly name: string;
  readonly required: boolean;
  readonly description: string;
}

/** Pure command tree shared by generated documentation and CLI help. */
export interface CliHelpCommand {
  readonly name: string;
  readonly description: string;
  readonly usage: string;
  readonly examples: readonly { readonly command: string; readonly description: string }[];
  readonly options: readonly CliHelpOption[];
  readonly arguments: readonly CliHelpArgument[];
  readonly commands: readonly CliHelpCommand[];
}

/** Versioned root command; returned instances are deeply frozen. */
export interface CliHelpModel extends CliHelpCommand {
  readonly version: string;
}
