/** Source identities join manifest imports to native reference headings without conflating aliases. */
export interface PublicSymbol {
  readonly name: string;
  readonly original: string;
  readonly source: string;
  readonly line: number;
  readonly description: string;
  readonly examples: readonly string[];
  readonly exampleSource?: string;
  readonly value: boolean;
}

/** One declared import path, including explicitly unsupported paths for an auditable disposition. */
export interface PublicImport {
  readonly packageName: string;
  readonly description: string;
  readonly directory: string;
  readonly specifier: string;
  readonly source: string;
  readonly internal: boolean;
  readonly symbols: readonly PublicSymbol[];
}

/** Additional implementation sources exposed through a supported package's re-exports. */
export interface ReferenceSource {
  readonly directory: string;
  readonly files: readonly string[];
}

/** A native docgen contract, with the exact slug computed by Blume's heading scanner. */
export interface SymbolContract {
  readonly href: string;
  readonly example: boolean;
}
